package com.example.backupagent.backup;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileStore;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.example.backupagent.api.deviceregister.DeviceRegistrationClient.DeviceRegistrationState;
import com.example.backupagent.diff.DiffModule.BackupType;
import com.example.backupagent.diff.DiffModule.DiffPlanner;
import com.example.backupagent.packager.KbcFormat;
import com.example.backupagent.packager.PackagerModule.MultiVolumePackager;
import com.example.backupagent.packager.PackagerModule.PackagedContainer;
import com.example.backupagent.packager.PackagerModule.Packager;
import com.example.backupagent.scan.Scanner.ExclusionFilter;
import com.example.backupagent.scan.Scanner.FileMetadata;
import com.example.backupagent.scan.Scanner.ScanResult;
import com.example.backupagent.scan.Scanner.ScanService;
import com.example.backupagent.session.SessionManager;
import com.example.backupagent.storage.Storage.ObjectStore;
import com.example.backupagent.storage.Storage.ObjectStore.ObjectStat;
import com.example.backupagent.storage.Storage.StorageBackend;
import com.example.backupagent.storage.Storage.UploadResult;
import com.example.backupagent.storage.Storage.Uploader;
import com.example.backupagent.supabase.SupabaseGateway;
import com.example.backupagent.supabase.SupabaseGateway.HistoryOperationType;
import com.example.backupagent.supabase.SupabaseGateway.HistoryRecord;
import com.example.backupagent.supabase.SupabaseGateway.HistoryStatus;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

/**
 * Agrega serviços e modelos relacionados ao fluxo de backup.
 */
public final class Backup {

    private Backup() {}

    /**
     * Serviço para listar backups históricos e verificar integridade (stale/missing).
     * Otimizado com paralelismo para não travar em catálogos grandes.
     */
    public static final class BackupCatalogService {

        private final SupabaseGateway supabaseGateway;
        private final ObjectStore objectStore;
        // Executor dedicado para IO de rede (verificação de containers)
        private final ExecutorService checkExecutor = Executors.newFixedThreadPool(16);

        public BackupCatalogService(SupabaseGateway supabaseGateway, ObjectStore objectStore) {
            this.supabaseGateway = Objects.requireNonNull(supabaseGateway);
            this.objectStore = Objects.requireNonNull(objectStore);
        }

        public List<CatalogEntry> list(String accessToken, String userId, UUID setId) throws IOException {
            List<ManifestRecord> manifests = supabaseGateway.manifestsForSet(accessToken, userId, setId);

            // Paralelismo: Verifica o status físico de N containers ao mesmo tempo
            List<CompletableFuture<CatalogEntry>> futures = manifests.stream()
                    .map(manifest -> CompletableFuture.supplyAsync(() -> checkContainer(manifest), checkExecutor))
                    .toList();

            return futures.stream()
                    .map(CompletableFuture::join)
                    .sorted(Comparator.comparing(e -> e.manifest().timestamp(), Comparator.reverseOrder()))
                    .collect(Collectors.toList());
        }

        private CatalogEntry checkContainer(ManifestRecord manifest) {
            try {
                return objectStore.stat(manifest.containerKey())
                        .map(stat -> {
                            if (manifest.containerSize() > 0 && stat.size() > 0 && stat.size() != manifest.containerSize()) {
                                return new CatalogEntry(manifest, ContainerState.STALE, stat);
                            }
                            return new CatalogEntry(manifest, ContainerState.OK, stat);
                        })
                        .orElseGet(() -> new CatalogEntry(manifest, ContainerState.MISSING, null));
            } catch (IOException e) {
                // Em caso de erro de rede no STAT, assumimos desconhecido ou tratamos como missing
                return new CatalogEntry(manifest, ContainerState.MISSING, null);
            }
        }

        public long totalBytesUsed(String accessToken, String userId, UUID setId) throws IOException {
            return supabaseGateway.totalBytesFromHistory(accessToken, userId, setId);
        }

        public enum ContainerState { OK, MISSING, STALE }

        public static final class CatalogEntry {
            private final ManifestRecord manifest;
            private final ContainerState containerState;
            private final ObjectStat stat;

            public CatalogEntry(ManifestRecord manifest, ContainerState containerState, ObjectStat stat) {
                this.manifest = manifest;
                this.containerState = containerState;
                this.stat = stat;
            }
            public ManifestRecord manifest() { return manifest; }
            public ContainerState containerState() { return containerState; }
            public ObjectStat stat() { return stat; }
        }
    }

    /**
     * Orquestrador do Backup. Liga Scan -> Diff -> Pack -> Upload -> Persistência.
     */
    public static final class BackupCoordinator {
        private static final Logger log = LoggerFactory.getLogger(BackupCoordinator.class);
        private final SessionManager sessionManager;
        private final ScanService scanService;
        private final DiffPlanner diffPlanner;
        private final Packager packager;
        private final Uploader cloudUploader;
        private final Uploader localUploader;
        private final SupabaseGateway supabase;
        private final Supplier<Path> localBaseDirProvider;

        // Controle de cancelamento/pause por volume (G)
        private volatile boolean cancelRequested = false;

        private final ObjectMapper mapper;

        public BackupCoordinator(SessionManager sessionManager, ScanService scanService,
                                 DiffPlanner diffPlanner, Packager packager,
                                 Uploader cloudUploader, Uploader localUploader,
                                 SupabaseGateway supabase, Supplier<Path> localBaseDirProvider) {
            this.sessionManager = Objects.requireNonNull(sessionManager);
            this.scanService = Objects.requireNonNull(scanService);
            this.diffPlanner = Objects.requireNonNull(diffPlanner);
            this.packager = Objects.requireNonNull(packager);
            this.cloudUploader = Objects.requireNonNull(cloudUploader);
            this.localUploader = Objects.requireNonNull(localUploader);
            this.supabase = Objects.requireNonNull(supabase);
            this.localBaseDirProvider = localBaseDirProvider != null ? localBaseDirProvider : () -> null;

            this.mapper = new ObjectMapper();
            this.mapper.enable(SerializationFeature.INDENT_OUTPUT);
            this.mapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);
        }

        // =====================
        // API PÚBLICA PRINCIPAL
        // =====================

        /**
         * Versão antiga do run — compatível.
         * Continua funcionando exatamente como antes, usando BackupConfig.defaultConfig().
         */
        public BackupResult run(Path root, StorageBackend target, DeviceRegistrationState deviceState) throws IOException {
            return run(root, target, deviceState, BackupConfig.defaultConfig());
        }

        /**
         * Versão nova do run com BackupConfig (E).
         */
        public BackupResult run(Path root,
                                StorageBackend target,
                                DeviceRegistrationState deviceState,
                                BackupConfig config) throws IOException {
            BackupConfig effective = (config != null) ? config : BackupConfig.defaultConfig();
            return runInternal(root, target, deviceState, effective);
        }

        /**
         * A) Backup multi-volume (vários roots, ex: C:, D:, E:...).
         * Continua no próximo volume mesmo se um falhar.
         */
        public List<BackupResult> runMultiVolume(List<Path> roots,
                                                 StorageBackend target,
                                                 DeviceRegistrationState deviceState) {
            return runMultiVolume(roots, target, deviceState, BackupConfig.defaultConfig());
        }

        public List<BackupResult> runMultiVolume(List<Path> roots,
                                                 StorageBackend target,
                                                 DeviceRegistrationState deviceState,
                                                 BackupConfig config) {
            Objects.requireNonNull(roots, "roots");
            BackupConfig effective = (config != null) ? config : BackupConfig.defaultConfig();

            List<BackupResult> results = new ArrayList<>();
            int total = roots.size();
            int index = 0;

            for (Path root : roots) {
                index++;
                if (cancelRequested) {
                    log.info("Cancelamento solicitado. Encerrando loop de volumes na posição {}/{}.", index, total);
                    break;
                }

                try {
                    notifyProgress(effective, BackupProgressEvent.Type.VOLUME_STARTED, root, index, total,
                            "Iniciando backup do volume " + root, 0.0);

                    BackupResult res = runInternal(root, target, deviceState, effective);
                    results.add(res);

                    notifyProgress(effective, BackupProgressEvent.Type.VOLUME_COMPLETED, root, index, total,
                            "Backup do volume concluído: " + root, 1.0);
                } catch (IOException e) {
                    log.error("Falha no backup do volume {}: {}", root, e.toString());
                    notifyProgress(effective, BackupProgressEvent.Type.ERROR, root, index, total,
                            "Falha no volume " + root + ": " + e.getMessage(), 0.0);
                    // Continua pros próximos volumes
                }
            }

            return results;
        }

        /**
         * G) Versão multi-volume com estado em disco (backup-progress.json).
         * Permite pausar (via requestCancel) e retomar depois.
         */
        public List<BackupResult> runMultiVolumeWithState(List<Path> roots,
                                                          StorageBackend target,
                                                          DeviceRegistrationState deviceState,
                                                          BackupConfig config,
                                                          Path stateFile) throws IOException {
            Objects.requireNonNull(roots, "roots");
            Objects.requireNonNull(stateFile, "stateFile");
            BackupConfig effective = (config != null) ? config : BackupConfig.defaultConfig();

            BackupProgressState state = loadProgressState(stateFile)
                    .orElseGet(() -> BackupProgressState.fromRoots(roots));
            Map<Path, BackupResult> successes = new LinkedHashMap<>();
            Map<Path, String> failures = new LinkedHashMap<>();

            // quais volumes ainda faltam
            Set<String> completed = new HashSet<>(state.completed);
            List<Path> toProcess = roots.stream()
                    .filter(p -> !completed.contains(p.toString()))
                    .toList();

            log.info("Resumindo backup multi-volume. Volumes totais={}, já concluídos={}, pendentes={}",
                    state.volumes.size(), state.completed.size(), toProcess.size());

            int total = roots.size();
            int volumeIndex = 0;
            for (Path root : roots) {
                volumeIndex++;

                if (!toProcess.contains(root)) {
                    // já concluído em execução anterior
                    continue;
                }

                if (cancelRequested) {
                    log.info("Cancelamento solicitado. Encerrando loop de volumes (com estado).");
                    break;
                }

                try {
                    notifyProgress(effective, BackupProgressEvent.Type.VOLUME_STARTED, root, volumeIndex, total,
                            "Iniciando backup do volume " + root, 0.0);

                    BackupResult res = runInternal(root, target, deviceState, effective);
                    successes.put(root, res);

                    state.completed.add(root.toString());
                    state.failed.remove(root.toString());
                    saveProgressState(stateFile, state);

                    notifyProgress(effective, BackupProgressEvent.Type.VOLUME_COMPLETED, root, volumeIndex, total,
                            "Backup do volume concluído: " + root, 1.0);
                } catch (IOException e) {
                    log.error("Falha no backup do volume {} (modo com estado): {}", root, e.toString());
                    state.failed.put(root.toString(), e.getMessage());
                    saveProgressState(stateFile, state);
                    failures.put(root, e.getMessage());
                    notifyProgress(effective, BackupProgressEvent.Type.ERROR, root, volumeIndex, total,
                            "Falha no volume " + root + ": " + e.getMessage(), 0.0);
                }
            }

            // Se todos concluídos, remove arquivo de estado
            if (state.completed.containsAll(state.volumes)) {
                try {
                    Files.deleteIfExists(stateFile);
                    log.info("Todos os volumes concluídos. Arquivo de progresso {} removido.", stateFile);
                } catch (IOException e) {
                    log.warn("Falha ao remover arquivo de progresso {}: {}", stateFile, e.toString());
                }
            }

            // Gera relatório consolidado (J), se habilitado
            if (effective.generateReport()) {
                ConsolidatedReport report = buildConsolidatedReport(successes, failures);
                Path reportDir = effective.reportDirectory() != null
                        ? effective.reportDirectory()
                        : defaultReportDirectory();
                try {
                    writeConsolidatedReport(report, reportDir);
                } catch (IOException e) {
                    log.warn("Falha ao escrever relatório consolidado em {}: {}", reportDir, e.toString());
                }
            }

            return new ArrayList<>(successes.values());
        }

        /**
         * F) Estimativa de tamanho/tempo do backup de um root.
         * Faz um scan real (como o run), mas sem pack/upload.
         */
        public BackupSizeEstimate estimateBackupSize(Path root, BackupConfig config) throws IOException {
            BackupConfig effective = (config != null) ? config : BackupConfig.defaultConfig();

            ExclusionFilter filter = resolveFilter(effective);
            ScanResult scanResult = (filter != null)
                    ? scanService.scan(root, filter)
                    : scanService.scan(root);

            List<FileMetadata> files = new ArrayList<>(scanResult.filesMap().values());
            long totalBytes = files.stream().mapToLong(FileMetadata::size).sum();
            int fileCount = files.size();

            // Reaproveita heurística do MultiVolumePackager (E/F)
            long maxBytes = effective.maxContainerBytes() > 0 ? effective.maxContainerBytes() : Long.MAX_VALUE;
            MultiVolumePackager estimator = new MultiVolumePackager(this.packager, maxBytes);
            long estimatedCompressed = estimator.estimateTotalCompressedSize(scanResult.root(), files);

            long throughput = effective.estimatedThroughputBytesPerSecond() > 0
                    ? effective.estimatedThroughputBytesPerSecond()
                    : 100L * 1024 * 1024; // 100 MB/s default

            long estimatedSeconds = throughput > 0 ? (totalBytes / throughput) : 0L;
            int estimatedVolumes = (effective.maxContainerBytes() > 0 && estimatedCompressed > 0)
                    ? (int) Math.ceil((double) estimatedCompressed / (double) effective.maxContainerBytes())
                    : 1;

            return new BackupSizeEstimate(root, fileCount, totalBytes, estimatedCompressed,
                    Duration.ofSeconds(estimatedSeconds), estimatedVolumes);
        }

        /**
         * B) Descobrir volumes Windows (C:, D:, ...).
         */
        public List<VolumeInfo> discoverWindowsVolumes() {
            List<VolumeInfo> result = new ArrayList<>();
            if (!isWindows()) {
                return result;
            }

            for (char drive = 'A'; drive <= 'Z'; drive++) {
                Path root = Path.of(drive + ":\\");
                try {
                    if (!Files.exists(root) || !Files.isDirectory(root)) {
                        continue;
                    }
                    FileStore store = Files.getFileStore(root);
                    long total = store.getTotalSpace();
                    if (total <= 0) continue;
                    long free = store.getUsableSpace();
                    long used = total - free;

                    String fsType = store.type();
                    String label = store.name();

                    VolumeInfo info = new VolumeInfo(root, label, fsType, total, used, free);
                    log.info("Volume Windows detectado: {} label={} type={} total={} used={} free={}",
                            root, label, fsType, total, used, free);

                    result.add(info);
                } catch (IOException e) {
                    log.debug("Falha ao inspecionar drive {}: {}", root, e.toString());
                }
            }
            return result;
        }

        public List<Path> discoverWindowsVolumeRoots() {
            return discoverWindowsVolumes().stream().map(VolumeInfo::mountPoint).toList();
        }

        /**
         * C) Descobrir volumes Linux/Mac (pontos de montagem reais).
         */
        public List<VolumeInfo> discoverLinuxVolumes() {
            List<VolumeInfo> result = new ArrayList<>();
            String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);

            // Linux: /proc/mounts ou /etc/mtab
            if (os.contains("linux")) {
                Path mounts = Path.of("/proc/mounts");
                if (!Files.isReadable(mounts)) {
                    mounts = Path.of("/etc/mtab");
                }

                Set<String> pseudo = Set.of(
                        "proc", "sysfs", "tmpfs", "devtmpfs", "cgroup", "cgroup2",
                        "overlay", "squashfs", "autofs", "rpc_pipefs", "debugfs",
                        "mqueue", "hugetlbfs", "securityfs", "devpts", "pstore",
                        "binfmt_misc"
                );
                Set<String> allowed = Set.of("ext2", "ext3", "ext4", "xfs", "btrfs", "zfs", "f2fs");

                if (Files.isReadable(mounts)) {
                    try (BufferedReader reader = Files.newBufferedReader(mounts, StandardCharsets.UTF_8)) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            String[] parts = line.split("\\s+");
                            if (parts.length < 3) continue;
                            String mountPointStr = parts[1];
                            String fsType = parts[2];

                            if (pseudo.contains(fsType)) continue;
                            if (!allowed.contains(fsType)) continue;

                            Path mountPoint = Path.of(mountPointStr);
                            try {
                                if (!Files.isDirectory(mountPoint)) continue;
                                FileStore store = Files.getFileStore(mountPoint);
                                long total = store.getTotalSpace();
                                if (total <= 0) continue;
                                long free = store.getUsableSpace();
                                long used = total - free;

                                VolumeInfo info = new VolumeInfo(mountPoint, mountPoint.toString(), fsType, total, used, free);
                                log.info("Linux volume detectado: {} type={} total={} used={} free={}",
                                        mountPoint, fsType, total, used, free);
                                result.add(info);
                            } catch (IOException e) {
                                log.debug("Falha ao inspecionar mount {}: {}", mountPointStr, e.toString());
                            }
                        }
                    } catch (IOException e) {
                        log.warn("Falha ao ler lista de mounts: {}", e.toString());
                    }
                }
                return result;
            }

            // Mac / outros Unix: raiz do filesystem
            if (os.contains("mac") || os.contains("darwin") || os.contains("bsd") || os.contains("nix") || os.contains("nux")) {
                FileSystem fs = FileSystems.getDefault();
                for (Path root : fs.getRootDirectories()) {
                    try {
                        FileStore store = Files.getFileStore(root);
                        long total = store.getTotalSpace();
                        if (total <= 0) continue;
                        long free = store.getUsableSpace();
                        long used = total - free;

                        String fsType = store.type();
                        String label = root.toString();

                        VolumeInfo info = new VolumeInfo(root, label, fsType, total, used, free);
                        log.info("Unix volume detectado: {} type={} total={} used={} free={}",
                                root, fsType, total, used, free);
                        result.add(info);
                    } catch (IOException e) {
                        log.debug("Falha ao inspecionar root {}: {}", root, e.toString());
                    }
                }
            }

            return result;
        }

        public List<Path> discoverLinuxVolumeRoots() {
            return discoverLinuxVolumes().stream().map(VolumeInfo::mountPoint).toList();
        }

        /**
         * I) Validação de estado do sistema antes de rodar backup.
         */
        public SystemValidationResult validateSystemState(List<Path> roots, StorageBackend target) {
            Objects.requireNonNull(roots, "roots");
            List<String> errors = new ArrayList<>();
            List<String> warnings = new ArrayList<>();

            // Verifica roots
            for (Path root : roots) {
                if (!Files.exists(root)) {
                    errors.add("Root não existe: " + root);
                    continue;
                }
                if (!Files.isDirectory(root)) {
                    errors.add("Root não é diretório: " + root);
                    continue;
                }
                if (!Files.isReadable(root)) {
                    errors.add("Sem permissão de leitura em: " + root);
                }
            }

            // Espaço no diretório temporário
            Path tmpDir;
            try {
                String tmpProp = System.getProperty("java.io.tmpdir");
                tmpDir = (tmpProp != null && !tmpProp.isBlank())
                        ? Path.of(tmpProp).toAbsolutePath().normalize()
                        : Path.of(".").toAbsolutePath().normalize();
                Files.createDirectories(tmpDir);
                FileStore store = Files.getFileStore(tmpDir);
                long usable = store.getUsableSpace();
                if (usable < (5L * 1024 * 1024 * 1024)) { // < 5GB
                    warnings.add("Pouco espaço livre no diretório temporário (" + usable + " bytes).");
                }
            } catch (IOException e) {
                warnings.add("Não foi possível verificar espaço livre no diretório temporário: " + e);
            }

            // Storage/backend: aqui só avisamos, pois não temos healthcheck direto
            warnings.add("Conectividade com backend " + target + " não foi testada automaticamente.");

            return new SystemValidationResult(errors, warnings);
        }

        /**
         * G) Solicitar cancelamento (pausa interrompendo após o volume atual).
         */
        public void requestCancel() {
            this.cancelRequested = true;
        }

        /**
         * G) Limpar flag de cancelamento (para próxima execução).
         */
        public void resetCancel() {
            this.cancelRequested = false;
        }

        // ==========================
        // IMPLEMENTAÇÃO INTERNA RUN
        // ==========================

        private BackupResult runInternal(Path root,
                                         StorageBackend target,
                                         DeviceRegistrationState deviceState,
                                         BackupConfig config) throws IOException {
            String accessToken = sessionManager.accessToken();
            String userId = sessionManager.sessionId();

            UUID setId = resolveSetId(root, config);

            log.info("=== JOB START: Backup para {} (Target: {}, crossVolumeDedup={}) ===",
                    root, target, config.crossVolumeDeduplication());

            notifyProgress(config, BackupProgressEvent.Type.SCAN_STARTED, root, 0, 0,
                    "Scan iniciado", 0.0);

            // 1. SCAN (com ou sem filtro de exclusão)
            ExclusionFilter filter = resolveFilter(config);
            ScanResult scanResult = (filter != null)
                    ? scanService.scan(root, filter)
                    : scanService.scan(root);

            notifyProgress(config, BackupProgressEvent.Type.SCAN_COMPLETED, root, 0, 0,
                    "Scan concluído: " + scanResult.filesMap().size() + " arquivos.", 1.0);

            log.info("Scan finalizado: {} arquivos encontrados.", scanResult.filesMap().size());

            // 2. PLAN (DIFF)
            List<ManifestRecord> existing = supabase.manifestsForSet(accessToken, userId, setId);
            Optional<ManifestRecord> latest = existing.stream()
                    .max(Comparator.comparing(ManifestRecord::timestamp));

            BackupPlan plan = diffPlanner.plan(scanResult, latest.orElse(null));
            log.info("Plano definido: {} (Baseado em: {})",
                    plan.type(),
                    plan.parentManifest().map(ManifestRecord::id).orElse(null));

            notifyProgress(config, BackupProgressEvent.Type.PLAN_CREATED, root, 0, 0,
                    "Plano de backup criado: " + plan.type(), 0.0);

            // 3. PERSISTÊNCIA INICIAL (History STARTED)
            UUID manifestId = UUID.randomUUID();
            String containerKey = objectKey(userId, plan.backupId());
            long totalBytes = plan.files().stream().mapToLong(FileMetadata::size).sum();

            HistoryRecord history = supabase.insertHistory(accessToken, HistoryRecord.builder()
                    .userId(userId).setId(setId).status(HistoryStatus.STARTED)
                    .type(HistoryOperationType.fromBackupType(plan.type()))
                    .root(root.toString()).repoDir(root.toString())
                    .startedAt(Instant.now()).backupId(plan.backupId().toString())
                    .containerKey(containerKey).filesTotal(plan.files().size()).bytesTotal(totalBytes)
                    .parentManifestId(plan.parentManifest().map(ManifestRecord::id).orElse(null))
                    .build());
            if (history.id() == null) {
                throw new IOException("History insert não retornou id; abortando antes do manifest.");
            }
            log.info("History criado: id={}, backup_id={}, set_id={}",
                    history.id(), history.backupId(), history.setId());

            PackagedContainer container = null;
            try {
                // 4. PACK (Compressão + Manifesto Embutido)
                String manifestJson = generateEmbeddedManifestJson(
                        manifestId, plan, scanResult, setId, deviceState, target);

                notifyProgress(config, BackupProgressEvent.Type.PACK_STARTED, root, 0, 0,
                        "Empacotando " + plan.files().size() + " arquivos...", 0.0);

                log.info("Empacotando {} arquivos...", plan.files().size());
                Instant startPack = Instant.now();
                container = packager.create(scanResult.root(), plan.files(),
                        plan.backupId().toString(), manifestJson);
                log.info("Pacote criado em {}s: {} bytes (Checksum: {})",
                        Duration.between(startPack, Instant.now()).toSeconds(),
                        container.size(), container.checksum());

                notifyProgress(config, BackupProgressEvent.Type.PACK_COMPLETED, root, 0, 0,
                        "Pacote criado: " + container.size() + " bytes", 1.0);

                // 5. UPLOAD
                Uploader uploader = (target == StorageBackend.LOCAL) ? localUploader : cloudUploader;
                Instant startUpload = Instant.now();
                notifyProgress(config, BackupProgressEvent.Type.UPLOAD_STARTED, root, 0, 0,
                        "Upload iniciado", 0.0);

                UploadResult uploadResult = uploader.upload(
                        container.path(), container.size(), userId,
                        plan.backupId(), container.checksum());

                notifyProgress(config, BackupProgressEvent.Type.UPLOAD_COMPLETED, root, 0, 0,
                        "Upload concluído", 1.0);

                log.info("Upload finalizado em {}s. ETag: {}",
                        Duration.between(startUpload, Instant.now()).toSeconds(),
                        uploadResult.etag());

                // 6. PERSISTÊNCIA FINAL (Manifest + Chunk Index + History SUCCESS)
                String finalKey = (target == StorageBackend.LOCAL)
                        ? StorageBackend.LOCAL.qualify(uploadResult.key())
                        : StorageBackend.CLOUD.qualify(uploadResult.key());

                ManifestRecord manifest = buildManifestRecord(
                        manifestId, plan, scanResult, uploadResult,
                        container, history.id().toString(), setId, target, finalKey);

                ManifestRecord storedManifest = supabase.insertManifest(accessToken, manifest, container.getChunksByPath());

                // Indexação de Chunks para Deduplicação Futura
                List<ChunkIndexRecord> chunks = buildChunkIndex(
                        userId, setId, storedManifest.id(), finalKey, container);
                if (!chunks.isEmpty()) {
                    supabase.upsertChunkIndexParallel(accessToken, chunks);
                }

                supabase.updateHistory(accessToken, history.toBuilder()
                        .status(HistoryStatus.SUCCESS).finishedAt(Instant.now())
                        .manifestId(storedManifest.id()).build());

                return new BackupResult(
                        plan.type(), storedManifest, uploadResult,
                        container.size(), container.checksum(), plan.files().size());

            } catch (Exception e) {
                log.error("Falha crítica no backup", e);
                try {
                    supabase.updateHistory(accessToken, history.toBuilder()
                            .status(HistoryStatus.ERROR).errorMessage(e.getMessage())
                            .finishedAt(Instant.now()).build());
                } catch (IOException ignored) {}
                notifyProgress(config, BackupProgressEvent.Type.ERROR, root, 0, 0,
                        "Erro no backup: " + e.getMessage(), 0.0);
                throw (e instanceof IOException) ? (IOException) e : new IOException(e);
            } finally {
                // Cleanup Temp
                if (container != null) {
                    try {
                        Files.deleteIfExists(container.path());
                    } catch (IOException ignored) {}
                }
            }
        }

        // --- Helpers de Construção de Objetos (mesmos da sua versão anterior) ---

        private String generateEmbeddedManifestJson(UUID manifestId, BackupPlan plan, ScanResult scan,
                                                    UUID setId, DeviceRegistrationState device, StorageBackend target)
                throws IOException {
            EmbeddedManifestDto dto = new EmbeddedManifestDto();
            dto.schemaVersion = 1;
            dto.manifestId = manifestId.toString();
            dto.jobId = plan.backupId().toString();
            dto.setId = setId.toString();
            dto.backupType = plan.type().name();
            dto.createdAt = Instant.now().toString();
            dto.root = scan.root().toString();
            dto.storageBackend = target.name().toLowerCase(Locale.ROOT);
            dto.userId = sessionManager.sessionId();

            if (localBaseDirProvider.get() != null) {
                dto.localDestination = localBaseDirProvider.get().toString();
            }

            if (device != null) {
                dto.device = new EmbeddedManifestDto.DeviceDto(device);
            } else {
                dto.device = new EmbeddedManifestDto.DeviceDto(
                        scan.root().getFileName().toString(),
                        System.getProperty("os.name"),
                        System.getProperty("os.arch"));
            }

            dto.files = plan.files().stream()
                    .map(f -> new EmbeddedManifestDto.FileDto(
                            f.relativePath().toString().replace('\\', '/'),
                            f.size(),
                            f.modifiedAt().toString(),
                            f.hash().orElse(null),
                            false
                    ))
                    .collect(Collectors.toList());

            return mapper.writeValueAsString(dto);
        }

        private ManifestRecord buildManifestRecord(UUID id, BackupPlan plan, ScanResult scan,
                                                   UploadResult upload, PackagedContainer container,
                                                   String historyId, UUID setId,
                                                   StorageBackend target, String finalKey) {

            // Mapeia chunks para seus arquivos
            Map<String, List<String>> chunksByFile = container.getChunksByPath().entrySet().stream()
                    .collect(Collectors.toMap(Map.Entry::getKey,
                            e -> e.getValue().stream().map(KbcFormat.ChunkEntry::hash).toList()));
            Set<String> includedPaths = container.getChunksByPath().keySet();

            List<ManifestFile> manifestFiles = plan.files().stream()
                    .filter(meta -> includedPaths.contains(meta.normalizedPath()))
                    .map(meta -> {
                        String path = meta.normalizedPath();
                        return new ManifestFile(path, meta.size(), meta.modifiedAt(),
                                meta.hash().orElse(null),
                                chunksByFile.getOrDefault(path, List.of()),
                                false);
                    }).toList();

            return ManifestRecord.builder()
                    .id(id).userId(sessionManager.sessionId()).setId(setId)
                    .parentManifestId(plan.parentManifest().map(ManifestRecord::id).orElse(null))
                    .root(scan.root().toString()).repoDir(scan.root().toString())
                    .type(plan.type()).timestamp(Instant.now())
                    .containerKey(finalKey).backupId(historyId)
                    .containerSize(container.size()).containerChecksum(container.checksum())
                    .containerName(upload.bucket())
                    .storageBackend(target == StorageBackend.LOCAL ? "local" : "s3")
                    .files(manifestFiles)
                    .build();
        }

        private List<ChunkIndexRecord> buildChunkIndex(String userId, UUID setId, UUID manifestId,
                                                       String key, PackagedContainer container) {
            // Usa Set para evitar duplicatas de chunk dentro do mesmo backup
            Set<ChunkIndexRecord> chunks = new HashSet<>();
            Instant now = Instant.now();

            container.getChunksByPath().values().forEach(list -> list.forEach(chunkInfo -> {
                chunks.add(ChunkIndexRecord.builder()
                        .userId(userId).setId(setId).hash(chunkInfo.hash())
                        .containerKey(key).offset(chunkInfo.offset())
                        .originalSize(chunkInfo.originalSize()).compressedSize(chunkInfo.compressedSize())
                        .firstManifestId(manifestId).lastManifestId(manifestId).lastSeenAt(now)
                        .build());
            }));
            return new ArrayList<>(chunks);
        }

        private String objectKey(String userId, UUID backupId) {
            return userId + "/" + backupId + "/container.tar.zst";
        }

        // --- Cross-volume dedupe (H) ---

        private UUID resolveSetId(Path root, BackupConfig config) {
            if (config != null && config.crossVolumeDeduplication()) {
                String key = "global:" + sessionManager.sessionId();
                return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8));
            }
            return deriveSetId(root);
        }

        // método antigo mantido para compatibilidade
        private UUID deriveSetId(Path root) {
            return UUID.nameUUIDFromBytes(
                    root.toAbsolutePath().normalize().toString().getBytes(StandardCharsets.UTF_8));
        }

        // --- Progresso & helpers internos ---

        private ExclusionFilter resolveFilter(BackupConfig config) {
            if (config == null || !config.useExclusionFilter()) {
                return null;
            }
            if (config.exclusionFilter() != null) {
                return config.exclusionFilter();
            }
            if (isWindows()) {
                return ExclusionFilter.forWindowsSystem();
            }
            return null; // pode criar outro preset pra Linux futuramente
        }

        private void notifyProgress(BackupConfig config,
                                    BackupProgressEvent.Type type,
                                    Path root,
                                    int volumeIndex,
                                    int totalVolumes,
                                    String message,
                                    double progress) {
            if (config == null || config.progressListener() == null) return;
            try {
                config.progressListener().onEvent(
                        new BackupProgressEvent(type, root, volumeIndex, totalVolumes, message, progress)
                );
            } catch (Exception e) {
                log.debug("Listener de progresso lançou exceção: {}", e.toString());
            }
        }

        private Optional<BackupProgressState> loadProgressState(Path stateFile) {
            try {
                if (!Files.exists(stateFile)) {
                    return Optional.empty();
                }
                try (Reader reader = Files.newBufferedReader(stateFile, StandardCharsets.UTF_8)) {
                    BackupProgressState state = mapper.readValue(reader, BackupProgressState.class);
                    return Optional.ofNullable(state);
                }
            } catch (IOException e) {
                log.warn("Falha ao carregar estado de progresso {}: {}", stateFile, e.toString());
                return Optional.empty();
            }
        }

        private void saveProgressState(Path stateFile, BackupProgressState state) {
            try {
                Path parent = stateFile.getParent();
                if (parent != null) {
                    Files.createDirectories(parent);
                }
                mapper.writeValue(stateFile.toFile(), state);
                log.debug("Estado de progresso salvo em {}", stateFile);
            } catch (IOException e) {
                log.warn("Falha ao salvar estado de progresso {}: {}", stateFile, e.toString());
            }
        }

        private Path defaultReportDirectory() {
            String home = System.getProperty("user.home");
            if (home != null && !home.isBlank()) {
                return Path.of(home, "backup-reports");
            }
            return Path.of(".").toAbsolutePath().normalize();
        }

        private ConsolidatedReport buildConsolidatedReport(Map<Path, BackupResult> successes,
                                                           Map<Path, String> failures) {
            List<ConsolidatedReport.VolumeReport> volumeReports = new ArrayList<>();
            long totalOriginal = 0L;
            long totalContainer = 0L;

            for (Map.Entry<Path, BackupResult> e : successes.entrySet()) {
                Path root = e.getKey();
                BackupResult res = e.getValue();
                ManifestRecord m = res.manifest();
                long originalBytes = m.files().stream().mapToLong(ManifestFile::size).sum();
                long containerBytes = m.containerSize();

                totalOriginal += originalBytes;
                totalContainer += containerBytes;

                volumeReports.add(new ConsolidatedReport.VolumeReport(
                        root.toString(), true, null,
                        originalBytes, containerBytes, m.files().size()
                ));
            }

            for (Map.Entry<Path, String> e : failures.entrySet()) {
                volumeReports.add(new ConsolidatedReport.VolumeReport(
                        e.getKey().toString(), false, e.getValue(),
                        0L, 0L, 0
                ));
            }

            double ratio = (totalContainer > 0)
                    ? (double) totalOriginal / (double) totalContainer
                    : 0.0;

            return new ConsolidatedReport(Instant.now().toString(),
                    volumeReports, totalOriginal, totalContainer, ratio);
        }

        private void writeConsolidatedReport(ConsolidatedReport report, Path directory) throws IOException {
            Files.createDirectories(directory);
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss"));

            Path jsonFile = directory.resolve("backup-report-" + timestamp + ".json");
            Path txtFile = directory.resolve("backup-report-" + timestamp + ".txt");

            mapper.writeValue(jsonFile.toFile(), report);

            StringBuilder sb = new StringBuilder();
            sb.append("Backup consolidado em ").append(report.createdAt()).append(System.lineSeparator());
            sb.append("Volumes: ").append(report.volumes().size()).append(System.lineSeparator());
            sb.append("Total original: ").append(report.totalOriginalBytes()).append(" bytes").append(System.lineSeparator());
            sb.append("Total containers: ").append(report.totalContainerBytes()).append(" bytes").append(System.lineSeparator());
            sb.append("Razão de compressão: ").append(String.format(Locale.ROOT, "%.2f", report.overallCompressionRatio()))
                    .append(System.lineSeparator()).append(System.lineSeparator());

            for (ConsolidatedReport.VolumeReport v : report.volumes()) {
                sb.append("- Volume: ").append(v.root()).append(System.lineSeparator());
                sb.append("  Sucesso: ").append(v.success()).append(System.lineSeparator());
                if (!v.success() && v.error() != null) {
                    sb.append("  Erro: ").append(v.error()).append(System.lineSeparator());
                }
                sb.append("  Arquivos: ").append(v.files()).append(System.lineSeparator());
                sb.append("  Original: ").append(v.originalBytes()).append(" bytes").append(System.lineSeparator());
                sb.append("  Container: ").append(v.containerBytes()).append(" bytes").append(System.lineSeparator());
                sb.append(System.lineSeparator());
            }

            Files.writeString(txtFile, sb.toString(), StandardCharsets.UTF_8);
            log.info("Relatório consolidado escrito em {} e {}", jsonFile, txtFile);
        }

        private static boolean isWindows() {
            String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
            return os.contains("win");
        }
    }


    // ==================================================================================
    // DTOs Auxiliares (Substituem a construção manual de JSON)
    // ==================================================================================

    private static class EmbeddedManifestDto {
        @JsonProperty("schema_version") public int schemaVersion;
        @JsonProperty("manifest_id") public String manifestId;
        @JsonProperty("job_id") public String jobId;
        @JsonProperty("set_id") public String setId;
        @JsonProperty("backup_type") public String backupType;
        @JsonProperty("created_at") public String createdAt;
        @JsonProperty("root") public String root;
        @JsonProperty("storage_backend") public String storageBackend;
        @JsonProperty("local_destination") public String localDestination;
        @JsonProperty("user_id") public String userId;
        @JsonProperty("device") public DeviceDto device;
        @JsonProperty("files") public List<FileDto> files;

        static class DeviceDto {
            public String hostname, os, arch, device_id, agent_id;
            public DeviceDto(String hostname, String os, String arch) {
                this.hostname = hostname; this.os = os; this.arch = arch;
            }
            public DeviceDto(DeviceRegistrationState state) {
                this.hostname = state.hostname(); this.os = state.os(); this.arch = state.arch();
                this.device_id = state.deviceId(); this.agent_id = state.agentId();
            }
        }
        static class FileDto {
            public String path;
            public long size;
            @JsonProperty("modified_at") public String modifiedAt;
            public String hash;
            @JsonProperty("is_deleted") public boolean isDeleted;
            public FileDto(String p, long s, String m, String h, boolean isDeleted) {
                this.path = p; this.size = s; this.modifiedAt = m; this.hash = h; this.isDeleted = isDeleted;
            }
        }
    }

    // ==================================================================================
    // Classes de Dados (Records/DTOs)
    // ==================================================================================

    public static final class BackupResult {
        private final BackupType type;
        private final ManifestRecord manifest;
        private final UploadResult upload;
        private final long containerSize;
        private final String containerChecksum;
        private final int filesIncluded;

        public BackupResult(BackupType type, ManifestRecord manifest, UploadResult upload,
                            long containerSize, String containerChecksum, int filesIncluded) {
            this.type = type; this.manifest = manifest; this.upload = upload;
            this.containerSize = containerSize; this.containerChecksum = containerChecksum; this.filesIncluded = filesIncluded;
        }
        public BackupType type() { return type; }
        public ManifestRecord manifest() { return manifest; }
    }

    public static final class BackupPlan {
        private final BackupType type;
        private final Path root;
        private final List<FileMetadata> files;
        private final ManifestRecord parentManifest;
        private final UUID backupId;

        private BackupPlan(BackupType type, Path root, List<FileMetadata> files, ManifestRecord parent, UUID id) {
            this.type = type; this.root = root; this.files = files; this.parentManifest = parent; this.backupId = id;
        }
        public BackupType type() { return type; }
        public List<FileMetadata> files() { return files; }
        public Optional<ManifestRecord> parentManifest() { return Optional.ofNullable(parentManifest); }
        public UUID backupId() { return backupId; }

        public static Builder builder() { return new Builder(); }
        public static class Builder {
            private BackupType type; private Path root; private List<FileMetadata> files; private ManifestRecord parent; private UUID id = UUID.randomUUID();
            public Builder type(BackupType t) { type=t; return this;}
            public Builder root(Path r) { root=r; return this;}
            public Builder files(List<FileMetadata> f) { files=f; return this;}
            public Builder parentManifest(ManifestRecord p) { parent=p; return this;}
            public Builder backupId(UUID i) { id=i; return this;}
            public BackupPlan build() { return new BackupPlan(type, root, files, parent, id); }
        }
    }

    public static final class ManifestFile {
        private final String path; private final long size; private final Instant modifiedAt; private final String hash; private final List<String> chunkHashes; private final boolean isDeleted;
        public ManifestFile(String path, long size, Instant modifiedAt, String hash, List<String> chunkHashes) {
            this(path, size, modifiedAt, hash, chunkHashes, false);
        }
        public ManifestFile(String path, long size, Instant modifiedAt, String hash, List<String> chunkHashes, boolean isDeleted) {
            this.path = path; this.size = size; this.modifiedAt = modifiedAt; this.hash = hash; this.chunkHashes = chunkHashes; this.isDeleted = isDeleted;
        }
        public String path() { return path; }
        public long size() { return size; }
        public Instant modifiedAt() { return modifiedAt; }
        public Optional<String> hash() { return Optional.ofNullable(hash); }
        public List<String> chunkHashes() { return chunkHashes; }
        public boolean isDeleted() { return isDeleted; }
    }

    public static final class ManifestRecord {
        private final UUID id; private final String userId; private final UUID setId; private final BackupType type;
        private final String containerKey; private final long containerSize; private final String containerChecksum; private final String containerName;
        private final UUID parentManifestId; private final Instant timestamp; private final String root; private final String repoDir;
        private final String backupId; private final String storageBackend; private final List<ManifestFile> files;

        private ManifestRecord(Builder b) {
            this.id=b.id; this.userId=b.userId; this.setId=b.setId; this.type=b.type; this.containerKey=b.containerKey;
            this.containerSize=b.containerSize; this.containerChecksum=b.containerChecksum; this.containerName=b.containerName;
            this.parentManifestId=b.parentManifestId; this.timestamp=b.timestamp; this.root=b.root; this.repoDir=b.repoDir;
            this.backupId=b.backupId; this.storageBackend=b.storageBackend; this.files=b.files;
        }
        public static Builder builder() { return new Builder(); }
        public UUID id() { return id; }
        public String userId() { return userId; }
        public UUID setId() { return setId; }
        public UUID parentManifestId() { return parentManifestId; }
        public String root() { return root; }
        public String repoDir() { return repoDir; }
        public String containerKey() { return containerKey; }
        public BackupType type() { return type; }
        public Instant timestamp() { return timestamp; }
        public long containerSize() { return containerSize; }
        public String containerChecksum() { return containerChecksum; }
        public String containerName() { return containerName; }
        public List<ManifestFile> files() { return files; }
        public String backupId() { return backupId; }
        public String storageBackend() { return storageBackend; }

        public static class Builder {
            UUID id, setId, parentManifestId; String userId, containerKey, containerChecksum, containerName, root, repoDir, backupId, storageBackend;
            BackupType type; long containerSize; Instant timestamp; List<ManifestFile> files;
            public Builder id(UUID i) { id=i; return this; }
            public Builder userId(String u) { userId=u; return this; }
            public Builder setId(UUID s) { setId=s; return this; }
            public Builder type(BackupType t) { type=t; return this; }
            public Builder containerKey(String c) { containerKey=c; return this; }
            public Builder containerSize(long s) { containerSize=s; return this; }
            public Builder containerChecksum(String c) { containerChecksum=c; return this; }
            public Builder containerName(String n) { containerName=n; return this; }
            public Builder parentManifestId(UUID p) { parentManifestId=p; return this; }
            public Builder timestamp(Instant t) { timestamp=t; return this; }
            public Builder root(String r) { root=r; return this; }
            public Builder repoDir(String r) { repoDir=r; return this; }
            public Builder backupId(String b) { backupId=b; return this; }
            public Builder storageBackend(String s) { storageBackend=s; return this; }
            public Builder files(List<ManifestFile> f) { files=f; return this; }
            public ManifestRecord build() { return new ManifestRecord(this); }
        }
    }

    public static final class ChunkIndexRecord {
        private final String userId; private final UUID setId; private final String hash; private final String containerKey;
        private final long offset; private final long originalSize; private final long compressedSize;
        private final UUID firstManifestId; private final UUID lastManifestId; private final Instant lastSeenAt;

        private ChunkIndexRecord(Builder b) {
            userId=b.userId; setId=b.setId; hash=b.hash; containerKey=b.containerKey; offset=b.offset;
            originalSize=b.originalSize; compressedSize=b.compressedSize; firstManifestId=b.firstManifestId;
            lastManifestId=b.lastManifestId; lastSeenAt=b.lastSeenAt;
        }
        public static Builder builder() { return new Builder(); }
        public String userId() { return userId; }
        public UUID setId() { return setId; }
        public String hash() { return hash; }
        public String containerKey() { return containerKey; }
        public long offset() { return offset; }
        public long originalSize() { return originalSize; }
        public long compressedSize() { return compressedSize; }
        public UUID firstManifestId() { return firstManifestId; }
        public UUID lastManifestId() { return lastManifestId; }
        public Instant lastSeenAt() { return lastSeenAt; }

        public static class Builder {
            String userId, hash, containerKey; UUID setId, firstManifestId, lastManifestId; long offset, originalSize, compressedSize; Instant lastSeenAt;
            public Builder userId(String u) { userId=u; return this; }
            public Builder setId(UUID s) { setId=s; return this; }
            public Builder hash(String h) { hash=h; return this; }
            public Builder containerKey(String c) { containerKey=c; return this; }
            public Builder offset(long o) { offset=o; return this; }
            public Builder originalSize(long s) { originalSize=s; return this; }
            public Builder compressedSize(long s) { compressedSize=s; return this; }
            public Builder firstManifestId(UUID f) { firstManifestId=f; return this; }
            public Builder lastManifestId(UUID l) { lastManifestId=l; return this; }
            public Builder lastSeenAt(Instant t) { lastSeenAt=t; return this; }
            public ChunkIndexRecord build() { return new ChunkIndexRecord(this); }
        }
        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            ChunkIndexRecord that = (ChunkIndexRecord) o;
            return Objects.equals(hash, that.hash) && Objects.equals(containerKey, that.containerKey);
        }
        @Override
        public int hashCode() { return Objects.hash(hash, containerKey); }
    }

    public static final class BackupConfig {

        private final boolean useExclusionFilter;
        private final ExclusionFilter exclusionFilter;
        private final long maxContainerBytes;
        private final int zstdCompressionLevelOverride;
        private final boolean crossVolumeDeduplication;
        private final boolean generateReport;
        private final Path reportDirectory;
        private final BackupProgressListener progressListener;
        private final long estimatedThroughputBytesPerSecond;

        private BackupConfig(Builder b) {
            this.useExclusionFilter = b.useExclusionFilter;
            this.exclusionFilter = b.exclusionFilter;
            this.maxContainerBytes = b.maxContainerBytes;
            this.zstdCompressionLevelOverride = b.zstdCompressionLevelOverride;
            this.crossVolumeDeduplication = b.crossVolumeDeduplication;
            this.generateReport = b.generateReport;
            this.reportDirectory = b.reportDirectory;
            this.progressListener = b.progressListener;
            this.estimatedThroughputBytesPerSecond = b.estimatedThroughputBytesPerSecond;
        }

        public static BackupConfig defaultConfig() {
            return builder().build();
        }

        public static Builder builder() {
            return new Builder();
        }

        public boolean useExclusionFilter() { return useExclusionFilter; }
        public ExclusionFilter exclusionFilter() { return exclusionFilter; }
        public long maxContainerBytes() { return maxContainerBytes; }
        public int zstdCompressionLevelOverride() { return zstdCompressionLevelOverride; }
        public boolean crossVolumeDeduplication() { return crossVolumeDeduplication; }
        public boolean generateReport() { return generateReport; }
        public Path reportDirectory() { return reportDirectory; }
        public BackupProgressListener progressListener() { return progressListener; }
        public long estimatedThroughputBytesPerSecond() { return estimatedThroughputBytesPerSecond; }

        public static final class Builder {
            private boolean useExclusionFilter = false;
            private ExclusionFilter exclusionFilter;
            private long maxContainerBytes = -1L;
            private int zstdCompressionLevelOverride = Integer.MIN_VALUE;
            private boolean crossVolumeDeduplication = false;
            private boolean generateReport = false;
            private Path reportDirectory;
            private BackupProgressListener progressListener;
            private long estimatedThroughputBytesPerSecond = 100L * 1024 * 1024; // 100MB/s

            public Builder useExclusionFilter(boolean v) { this.useExclusionFilter = v; return this; }
            public Builder exclusionFilter(ExclusionFilter f) { this.exclusionFilter = f; return this; }
            public Builder maxContainerBytes(long v) { this.maxContainerBytes = v; return this; }
            public Builder zstdCompressionLevelOverride(int v) { this.zstdCompressionLevelOverride = v; return this; }
            public Builder crossVolumeDeduplication(boolean v) { this.crossVolumeDeduplication = v; return this; }
            public Builder generateReport(boolean v) { this.generateReport = v; return this; }
            public Builder reportDirectory(Path p) { this.reportDirectory = p; return this; }
            public Builder progressListener(BackupProgressListener l) { this.progressListener = l; return this; }
            public Builder estimatedThroughputBytesPerSecond(long v) { this.estimatedThroughputBytesPerSecond = v; return this; }

            public BackupConfig build() {
                return new BackupConfig(this);
            }
        }
    }

    public static final class VolumeInfo {
        private final Path mountPoint;
        private final String label;
        private final String fileSystemType;
        private final long totalSpace;
        private final long usedSpace;
        private final long freeSpace;

        public VolumeInfo(Path mountPoint, String label, String fileSystemType,
                          long totalSpace, long usedSpace, long freeSpace) {
            this.mountPoint = mountPoint;
            this.label = label;
            this.fileSystemType = fileSystemType;
            this.totalSpace = totalSpace;
            this.usedSpace = usedSpace;
            this.freeSpace = freeSpace;
        }

        public Path mountPoint() { return mountPoint; }
        public String label() { return label; }
        public String fileSystemType() { return fileSystemType; }
        public long totalSpace() { return totalSpace; }
        public long usedSpace() { return usedSpace; }
        public long freeSpace() { return freeSpace; }

        public double usagePercentage() {
            if (totalSpace <= 0) return 0.0;
            return (usedSpace * 100.0) / (double) totalSpace;
        }

        /**
         * Heurística simples: backup só de volumes "realmente usados".
         */
        public boolean shouldBackup() {
            return totalSpace > (1L * 1024 * 1024 * 1024L) // > 1GB
                    && usagePercentage() > 1.0;            // > 1% usado
        }
    }

    public static final class BackupSizeEstimate {
        private final Path root;
        private final long fileCount;
        private final long totalBytes;
        private final long estimatedCompressedBytes;
        private final Duration estimatedDuration;
        private final int estimatedVolumes;

        public BackupSizeEstimate(Path root,
                                  long fileCount,
                                  long totalBytes,
                                  long estimatedCompressedBytes,
                                  Duration estimatedDuration,
                                  int estimatedVolumes) {
            this.root = root;
            this.fileCount = fileCount;
            this.totalBytes = totalBytes;
            this.estimatedCompressedBytes = estimatedCompressedBytes;
            this.estimatedDuration = estimatedDuration;
            this.estimatedVolumes = estimatedVolumes;
        }

        public Path root() { return root; }
        public long fileCount() { return fileCount; }
        public long totalBytes() { return totalBytes; }
        public long estimatedCompressedBytes() { return estimatedCompressedBytes; }
        public Duration estimatedDuration() { return estimatedDuration; }
        public int estimatedVolumes() { return estimatedVolumes; }
    }

    public static final class SystemValidationResult {
        private final List<String> errors;
        private final List<String> warnings;

        public SystemValidationResult(List<String> errors, List<String> warnings) {
            this.errors = List.copyOf(errors);
            this.warnings = List.copyOf(warnings);
        }

        public List<String> errors() { return errors; }
        public List<String> warnings() { return warnings; }
        public boolean isOk() { return errors.isEmpty(); }
    }

    public static final class BackupProgressEvent {

        public enum Type {
            SCAN_STARTED,
            SCAN_COMPLETED,
            PLAN_CREATED,
            PACK_STARTED,
            PACK_COMPLETED,
            UPLOAD_STARTED,
            UPLOAD_COMPLETED,
            VOLUME_STARTED,
            VOLUME_COMPLETED,
            ERROR
        }

        private final Type type;
        private final Path root;
        private final int volumeIndex;
        private final int totalVolumes;
        private final String message;
        private final double progress;

        public BackupProgressEvent(Type type, Path root,
                                   int volumeIndex, int totalVolumes,
                                   String message, double progress) {
            this.type = type;
            this.root = root;
            this.volumeIndex = volumeIndex;
            this.totalVolumes = totalVolumes;
            this.message = message;
            this.progress = progress;
        }

        public Type type() { return type; }
        public Path root() { return root; }
        public int volumeIndex() { return volumeIndex; }
        public int totalVolumes() { return totalVolumes; }
        public String message() { return message; }
        public double progress() { return progress; }
    }

    public interface BackupProgressListener {
        void onEvent(BackupProgressEvent event);
    }

    public static final class BackupProgressState {
        @JsonProperty("volumes")
        public List<String> volumes;
        @JsonProperty("completed")
        public List<String> completed;
        @JsonProperty("failed")
        public Map<String, String> failed;

        public BackupProgressState() {
            // Jackson
        }

        public BackupProgressState(List<String> volumes,
                                   List<String> completed,
                                   Map<String, String> failed) {
            this.volumes = volumes;
            this.completed = completed;
            this.failed = failed;
        }

        public static BackupProgressState fromRoots(List<Path> roots) {
            List<String> vols = roots.stream().map(Path::toString).toList();
            return new BackupProgressState(new ArrayList<>(vols),
                    new ArrayList<>(), new HashMap<>());
        }
    }

    public static final class ConsolidatedReport {
        @JsonProperty("created_at")
        private final String createdAt;
        @JsonProperty("volumes")
        private final List<VolumeReport> volumes;
        @JsonProperty("total_original_bytes")
        private final long totalOriginalBytes;
        @JsonProperty("total_container_bytes")
        private final long totalContainerBytes;
        @JsonProperty("overall_compression_ratio")
        private final double overallCompressionRatio;

        public ConsolidatedReport(String createdAt,
                                  List<VolumeReport> volumes,
                                  long totalOriginalBytes,
                                  long totalContainerBytes,
                                  double overallCompressionRatio) {
            this.createdAt = createdAt;
            this.volumes = List.copyOf(volumes);
            this.totalOriginalBytes = totalOriginalBytes;
            this.totalContainerBytes = totalContainerBytes;
            this.overallCompressionRatio = overallCompressionRatio;
        }

        public String createdAt() { return createdAt; }
        public List<VolumeReport> volumes() { return volumes; }
        public long totalOriginalBytes() { return totalOriginalBytes; }
        public long totalContainerBytes() { return totalContainerBytes; }
        public double overallCompressionRatio() { return overallCompressionRatio; }

        public static final class VolumeReport {
            @JsonProperty("root")
            private final String root;
            @JsonProperty("success")
            private final boolean success;
            @JsonProperty("error")
            private final String error;
            @JsonProperty("original_bytes")
            private final long originalBytes;
            @JsonProperty("container_bytes")
            private final long containerBytes;
            @JsonProperty("files")
            private final int files;

            public VolumeReport(String root,
                                boolean success,
                                String error,
                                long originalBytes,
                                long containerBytes,
                                int files) {
                this.root = root;
                this.success = success;
                this.error = error;
                this.originalBytes = originalBytes;
                this.containerBytes = containerBytes;
                this.files = files;
            }

            public String root() { return root; }
            public boolean success() { return success; }
            public String error() { return error; }
            public long originalBytes() { return originalBytes; }
            public long containerBytes() { return containerBytes; }
            public int files() { return files; }
        }
    }

}
