package com.example.backupagent.restore;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.example.backupagent.backup.Backup.ChunkIndexRecord;
import com.example.backupagent.backup.Backup.ManifestFile;
import com.example.backupagent.backup.Backup.ManifestRecord;
import com.example.backupagent.diff.DiffModule.BackupType;
import com.example.backupagent.session.SessionManager;
import com.example.backupagent.storage.Storage.ObjectStore;
import com.example.backupagent.supabase.SupabaseGateway;
import com.example.backupagent.supabase.SupabaseGateway.HistoryOperationType;
import com.example.backupagent.supabase.SupabaseGateway.HistoryRecord;
import com.example.backupagent.supabase.SupabaseGateway.HistoryStatus;

/**
 * Agrega todas as classes relacionadas ao fluxo de restauração.
 * <p>
 * Inclui:
 * 1. Planner: Resolve dependências de backup incremental.
 * 2. Executor: Baixa e reconstrói arquivos em PARALELO.
 * 3. Service: Orquestra o processo e atualiza histórico/banco.
 */
public final class Restore {

    private Restore() {}

    // ==================================================================================
    // DTOs (Data Transfer Objects) - Imutáveis
    // ==================================================================================

    /** Representa a cadeia de manifests necessária para restaurar um estado. */
    public static final class RestoreChain {
        private final List<ManifestRecord> manifests;
        private final List<String> missingContainers;

        public RestoreChain(List<ManifestRecord> manifests, List<String> missingContainers) {
            this.manifests = Collections.unmodifiableList(List.copyOf(manifests));
            this.missingContainers = Collections.unmodifiableList(List.copyOf(missingContainers));
        }

        public List<ManifestRecord> manifests() { return manifests; }
        public List<String> missingContainers() { return missingContainers; }
        public boolean isComplete() { return missingContainers.isEmpty(); }
        public int appliedManifests() { return manifests.size(); }
    }

    /** Plano lógico para restaurar arquivos. Mapeia Arquivo -> Lista de Chunks Necessários ou modo TAR completo. */
    @SuppressWarnings({"FieldCanBeLocal", "unused"})
    public static final class RestorePlan {
        private final List<FilePlan> files;
        private final List<String> missingChunks;
        private final RestoreChain chain;
        private final boolean streamFromTar;

        public RestorePlan(List<FilePlan> files, List<String> missingChunks, RestoreChain chain, boolean streamFromTar) {
            this.files = Collections.unmodifiableList(List.copyOf(files));
            this.missingChunks = Collections.unmodifiableList(List.copyOf(missingChunks));
            this.chain = chain;
            this.streamFromTar = streamFromTar;
        }

        public List<FilePlan> files() { return files; }
        public List<String> missingChunks() { return missingChunks; }
        public boolean hasMissingChunks() { return !missingChunks.isEmpty(); }
        public boolean streamFromTar() { return streamFromTar; }

        public static final class FilePlan {
            private final ManifestFile file;
            private final List<ChunkDownload> chunks;
            private final String containerKey;

            public FilePlan(ManifestFile file, List<ChunkDownload> chunks, String containerKey) {
                this.file = file;
                this.chunks = Collections.unmodifiableList(List.copyOf(chunks));
                this.containerKey = containerKey;
            }
            public ManifestFile file() { return file; }
            public List<ChunkDownload> chunks() { return chunks; }
            public String containerKey() { return containerKey; }
        }

        @SuppressWarnings({"FieldCanBeLocal", "unused"})
        public static final class ChunkDownload {
            private final String hash;
            private final String containerKey;
            private final long offset;
            private final long originalSize;
            private final long compressedSize;

            public ChunkDownload(String hash, String containerKey, long offset, long originalSize, long compressedSize) {
                this.hash = hash;
                this.containerKey = containerKey;
                this.offset = offset;
                this.originalSize = originalSize;
                this.compressedSize = compressedSize;
            }
            public String containerKey() { return containerKey; }
            public long offset() { return offset; }
            public long originalSize() { return originalSize; }
            public long compressedSize() { return compressedSize; }
            public long endOffsetInclusive() { return offset + compressedSize - 1; }
        }
    }

    /** Relatório final da execução. */
    @SuppressWarnings({"FieldCanBeLocal", "unused"})
    public static final class RestoreReport {
        private final Path destination;
        private final List<FileResult> files;
        private final List<String> missingChunks;

        public RestoreReport(Path destination, List<FileResult> files, List<String> missingChunks) {
            this.destination = destination;
            this.files = Collections.unmodifiableList(List.copyOf(files));
            this.missingChunks = Collections.unmodifiableList(List.copyOf(missingChunks));
        }

        public boolean success() {
            return missingChunks.isEmpty() && files.stream().allMatch(FileResult::success);
        }
        public List<FileResult> files() { return files; }
        public List<String> missingChunks() { return missingChunks; }

        @SuppressWarnings({"FieldCanBeLocal", "unused"})
        public static final class FileResult {
            private final Path path;
            private final boolean success;
            private final String error;
            private final long bytesWritten;

            public FileResult(Path path, boolean success, String error, long bytesWritten) {
                this.path = path;
                this.success = success;
                this.error = error;
                this.bytesWritten = bytesWritten;
            }
            public Path path() { return path; }
            public boolean success() { return success; }
            public String error() { return error; }
        }
    }

    @SuppressWarnings({"FieldCanBeLocal", "unused"})
    public static final class RestoreResult {
        private final Path destination;
        private final int appliedManifests;
        private final int restoredFiles;

        public RestoreResult(Path destination, int appliedManifests, int restoredFiles) {
            this.destination = Objects.requireNonNull(destination);
            this.appliedManifests = appliedManifests;
            this.restoredFiles = restoredFiles;
        }
        public Path destination() { return destination; }
    }

    // ==================================================================================
    // PLANNER (Lógica de Dependência)
    // ==================================================================================

    public static final class RestorePlanner {
        private final SupabaseGateway supabaseGateway;
        private final ObjectStore objectStore;

        public RestorePlanner(SupabaseGateway supabaseGateway, ObjectStore objectStore) {
            this.supabaseGateway = Objects.requireNonNull(supabaseGateway);
            this.objectStore = Objects.requireNonNull(objectStore);
        }

        /**
         * Reconstrói a cadeia de dependência (Ex: Full -> Incr 1 -> Incr 2)
         * e verifica se todos os containers físicos existem no storage.
         */
        public RestoreChain resolveChain(String accessToken, String userId, UUID setId, UUID targetManifestId) throws IOException {
            List<ManifestRecord> manifests = supabaseGateway.manifestsForSet(accessToken, userId, setId);
            if (manifests.isEmpty()) throw new IOException("Nenhum manifest encontrado para o set " + setId);

            Map<UUID, ManifestRecord> cache = manifests.stream()
                    .collect(Collectors.toMap(ManifestRecord::id, m -> m));

            // Se não informou alvo, tenta achar o mais recente válido
            if (targetManifestId == null) {
                for (ManifestRecord candidate : manifests) {
                    try {
                        RestoreChain chain = buildChain(accessToken, candidate, cache);
                        if (chain.isComplete()) return chain;
                    } catch (IOException ignored) {}
                }
                throw new IOException("Nenhuma cadeia de restore válida encontrada.");
            }

            ManifestRecord target = cache.get(targetManifestId);
            if (target == null) throw new IOException("Manifest alvo não encontrado: " + targetManifestId);

            RestoreChain chain = buildChain(accessToken, target, cache);
            if (!chain.isComplete()) {
                throw new IOException("Cadeia incompleta: faltam containers " + chain.missingContainers());
            }
            return chain;
        }

        public RestorePlan planFiles(String accessToken, String userId, UUID setId, RestoreChain chain) throws IOException {
            // 1. "Flattening" dos arquivos: Última versão vence e retem o container de origem
            record SelectedFile(ManifestFile file, String containerKey) {}
            Map<String, SelectedFile> filesByPath = new LinkedHashMap<>();
            for (ManifestRecord manifest : chain.manifests()) {
                for (ManifestFile file : manifest.files()) {
                    filesByPath.put(normalize(file.path()), new SelectedFile(file, manifest.containerKey()));
                }
            }

            // 2. Coletar todos os hashes necessários
            Set<String> requiredChunks = filesByPath.values().stream()
                    .flatMap(f -> f.file().chunkHashes().stream())
                    .collect(Collectors.toSet());

            // 3. Buscar localização dos chunks no banco (Deduplicação) - pode vir vazio no schema novo
            Map<String, ChunkIndexRecord> chunkIndex = supabaseGateway.chunkIndexByHashes(accessToken, userId, setId, requiredChunks);
            boolean streamFromTar = chunkIndex.isEmpty();

            // 4. Montar plano
            List<RestorePlan.FilePlan> filePlans = new ArrayList<>();
            List<String> missingChunks = new ArrayList<>();

            for (SelectedFile selected : filesByPath.values()) {
                ManifestFile file = selected.file();
                List<RestorePlan.ChunkDownload> chunks = new ArrayList<>();

                if (!streamFromTar) {
                    if (file.size() > 0 && file.chunkHashes().isEmpty()) {
                        missingChunks.add("Erro metadata: arquivo sem chunks " + file.path());
                    }
                    for (String hash : file.chunkHashes()) {
                        ChunkIndexRecord record = chunkIndex.get(hash);
                        if (record == null) {
                            missingChunks.add(hash);
                            continue;
                        }
                        chunks.add(new RestorePlan.ChunkDownload(
                                hash, record.containerKey(), record.offset(),
                                record.originalSize(),
                                record.compressedSize() > 0 ? record.compressedSize() : record.originalSize()
                        ));
                    }
                }

                filePlans.add(new RestorePlan.FilePlan(file, chunks, selected.containerKey()));
            }
            return new RestorePlan(filePlans, missingChunks, chain, streamFromTar);
        }

        private RestoreChain buildChain(String accessToken, ManifestRecord target, Map<UUID, ManifestRecord> cache) throws IOException {
            List<ManifestRecord> ordered = new ArrayList<>();
            Set<UUID> visited = new HashSet<>();
            ManifestRecord current = target;

            // Navega para trás (Filho -> Pai)
            while (current != null) {
                if (!visited.add(current.id())) throw new IOException("Ciclo detectado na cadeia de manifests");
                ordered.add(current);
                UUID parentId = current.parentManifestId();
                if (parentId == null) break;

                ManifestRecord parent = cache.get(parentId);
                if (parent == null) {
                    // Tenta buscar no banco se não estiver no cache inicial
                    parent = supabaseGateway.manifestById(accessToken, parentId)
                            .orElseThrow(() -> new IOException("Manifest pai ausente: " + parentId));
                    cache.put(parent.id(), parent);
                }
                current = parent;
            }

            Collections.reverse(ordered); // Vira para (Pai -> Filho)
            if (ordered.isEmpty() || ordered.get(0).type() != BackupType.FULL) {
                throw new IOException("Cadeia inválida: o primeiro backup deve ser FULL");
            }

            List<String> missingContainers = new ArrayList<>();
            for (ManifestRecord manifest : ordered) {
                String key = manifest.containerKey();
                try {
                    if (objectStore.stat(key).isEmpty()) {
                        missingContainers.add(key);
                    }
                } catch (IOException e) {
                    throw new IOException("Falha ao validar container " + key + ": " + e.getMessage(), e);
                }
            }

            return new RestoreChain(ordered, missingContainers);
        }

        private String normalize(String path) {
            return path.replace('\\', '/');
        }
    }

    // ==================================================================================
    // EXECUTOR (Download Paralelo)
    // ==================================================================================

    public static final class RestoreExecutor {
        private static final Logger log = LoggerFactory.getLogger(RestoreExecutor.class);
        private final ObjectStore objectStore;

        public RestoreExecutor(ObjectStore objectStore, String hashAlgorithm) {
            this(objectStore, hashAlgorithm, 16); // Default: 16 threads (mantido para compatibilidade)
        }

        public RestoreExecutor(ObjectStore objectStore, String hashAlgorithm, int parallelism) {
            this.objectStore = Objects.requireNonNull(objectStore);
            // hashAlgorithm e parallelism ignorados (não mais necessários com KBC)
        }

        public RestoreReport restore(RestorePlan plan, Path destination) throws IOException {
            Files.createDirectories(destination);

            // Usa formato KBC (acesso aleatório aos chunks)
            Map<String, List<RestorePlan.FilePlan>> byContainer = plan.files().stream()
                    .collect(Collectors.groupingBy(RestorePlan.FilePlan::containerKey));

            List<RestoreReport.FileResult> results = new ArrayList<>();

            for (Map.Entry<String, List<RestorePlan.FilePlan>> entry : byContainer.entrySet()) {
                String containerKey = entry.getKey();
                RestoreReport containerReport = restoreFromKbc(plan, destination, containerKey);
                results.addAll(containerReport.files());
            }

            return new RestoreReport(destination, results, List.of());
        }



        /**
         * Restaura arquivos de um container KBC (acesso aleatório).
         */
        private RestoreReport restoreFromKbc(RestorePlan plan, Path destination, String containerKey) throws IOException {
            // Filtra apenas os arquivos que pertencem a este container
            List<RestorePlan.FilePlan> filesInThisContainer = plan.files().stream()
                    .filter(fp -> fp.containerKey().equals(containerKey))
                    .toList();
            
            if (filesInThisContainer.isEmpty()) {
                log.warn("[RESTORE] Nenhum arquivo a restaurar do container: {}", containerKey);
                return new RestoreReport(destination, List.of(), List.of());
            }
            
            // Baixa container completo temporariamente (necessário para RandomAccessFile)
            Path tempFile = Files.createTempFile("restore-kbc-", ".kbc");
            try {
                try (InputStream in = objectStore.readRange(containerKey, 0, Long.MAX_VALUE);
                     OutputStream out = Files.newOutputStream(tempFile)) {
                    in.transferTo(out);
                }

                List<RestoreReport.FileResult> results = new ArrayList<>();

                try (com.example.backupagent.packager.KbcFormat.Reader reader = 
                        com.example.backupagent.packager.KbcFormat.Reader.open(tempFile)) {

                    // Log dos primeiros 10 caminhos no índice para debug
                    var indexPaths = reader.getIndex().byPath().keySet();
                    log.info("[RESTORE DEBUG] Container: {} - Total de caminhos no índice KBC: {}", containerKey, indexPaths.size());
                    indexPaths.stream().limit(5).forEach(p -> log.info("[RESTORE DEBUG] Caminho no índice: {}", p));

                    for (RestorePlan.FilePlan fp : filesInThisContainer) {
                        Path target = destination.resolve(fp.file().path()).normalize();
                        if (!target.startsWith(destination)) {
                            results.add(new RestoreReport.FileResult(target, false, "Path traversal detectado", 0));
                            continue;
                        }

                        try {
                            Path parent = target.getParent();
                            if (parent != null) Files.createDirectories(parent);

                            String normPath = normalize(fp.file().path());
                            log.info("[RESTORE DEBUG] Procurando: {} (original: {})", normPath, fp.file().path());
                            
                            // Verifica se existe no índice antes de tentar ler
                            if (!reader.getIndex().byPath().containsKey(normPath)) {
                                log.warn("[RESTORE] Arquivo não encontrado no container: {} - PULANDO", normPath);
                                results.add(new RestoreReport.FileResult(target, false, "Arquivo não encontrado no container KBC", 0));
                                continue;
                            }
                            
                            long written = 0;

                            try (InputStream fileIn = reader.readFile(normPath);
                                 OutputStream fileOut = new BufferedOutputStream(Files.newOutputStream(target))) {

                                byte[] buffer = new byte[64 * 1024];
                                int read;
                                while ((read = fileIn.read(buffer)) != -1) {
                                    fileOut.write(buffer, 0, read);
                                    written += read;
                                }
                            }

                            results.add(new RestoreReport.FileResult(target, true, null, written));

                        } catch (IOException e) {
                            log.error("[RESTORE] Erro ao restaurar {}: {}", fp.file().path(), e.getMessage());
                            results.add(new RestoreReport.FileResult(target, false, e.getMessage(), 0));
                        }
                    }
                }

                return new RestoreReport(destination, results, List.of());

            } finally {
                try { Files.deleteIfExists(tempFile); } catch (IOException ignored) {}
            }
        }



        private String normalize(String path) {
            return path.replace('\\', '/');
        }
    }

    // ==================================================================================
    // SERVICE (Orquestração)
    // ==================================================================================

    public static final class RestoreService {
        private static final Logger log = LoggerFactory.getLogger(RestoreService.class);
        private final SessionManager sessionManager;
        private final SupabaseGateway supabaseGateway;
        private final RestorePlanner planner;
        private final RestoreExecutor executor;

        public RestoreService(SessionManager sessionManager, SupabaseGateway supabaseGateway,
                              RestorePlanner planner, RestoreExecutor executor) {
            this.sessionManager = Objects.requireNonNull(sessionManager);
            this.supabaseGateway = Objects.requireNonNull(supabaseGateway);
            this.planner = Objects.requireNonNull(planner);
            this.executor = Objects.requireNonNull(executor);
        }

        public RestoreResult restore(Path root, UUID targetManifestId, Path destination) throws IOException {
            Objects.requireNonNull(root, "root");
            Objects.requireNonNull(destination, "destination");
            String accessToken = sessionManager.accessToken();
            String userId = sessionManager.sessionId();
            UUID setId = UUID.nameUUIDFromBytes(root.toAbsolutePath().normalize().toString().getBytes(StandardCharsets.UTF_8));

            // 1. Planejamento
            RestoreChain chain = planner.resolveChain(accessToken, userId, setId, targetManifestId);
            RestorePlan plan = planner.planFiles(accessToken, userId, setId, chain);
            if (plan.hasMissingChunks()) {
                throw new IOException("Impossível restaurar. Chunks ausentes: " + plan.missingChunks());
            }

            // 2. Preparação (Atomicidade)
            Path parent = destination.toAbsolutePath().getParent();
            if (parent == null) throw new IOException("Destino inválido: " + destination);
            Path staging = Files.createTempDirectory(parent, "keeply-restore-tmp-");

            // 3. Registro de Auditoria (Inicio)
            ManifestRecord head = chain.manifests().get(chain.manifests().size() - 1);
            long totalBytes = plan.files().stream().mapToLong(fp -> fp.file().size()).sum();
            HistoryRecord history = supabaseGateway.insertHistory(accessToken, HistoryRecord.builder()
                    .userId(userId).root(root.toString()).repoDir(root.toString())
                    .type(HistoryOperationType.fromBackupType(head.type()))
                    .status(HistoryStatus.STARTED)
                    .filesTotal(plan.files().size()).bytesTotal(totalBytes)
                    .startedAt(Instant.now()).backupId(head.backupId()).containerKey(head.containerKey())
                    .setId(setId).build());

            try {
                // 4. Execução (Paralela)
                RestoreReport report = executor.restore(plan, staging);

                if (!report.success()) {
                    throw new IOException("Falha na restauração: " + summarize(report));
                }

                // 5. Finalização (Move Atômico)
                moveAtomically(staging, parent.resolve(destination.getFileName()));

                // 6. Registro de Sucesso
                supabaseGateway.updateHistory(accessToken, history.toBuilder()
                        .status(HistoryStatus.SUCCESS).finishedAt(Instant.now()).build());

                return new RestoreResult(destination, chain.appliedManifests(), plan.files().size());

            } catch (IOException | RuntimeException e) {
                // Registro de Erro
                log.error("Restore falhou", e);
                try {
                    supabaseGateway.updateHistory(accessToken, history.toBuilder()
                            .status(HistoryStatus.ERROR).errorMessage(e.getMessage()).finishedAt(Instant.now()).build());
                } catch (IOException ignored) {}
                throw (e instanceof IOException) ? (IOException) e : new IOException(e);
            } finally {
                cleanup(staging);
            }
        }

        private String summarize(RestoreReport report) {
            StringBuilder sb = new StringBuilder();
            if (!report.missingChunks().isEmpty()) sb.append("chunks ausentes=").append(report.missingChunks());
            report.files().stream().filter(r -> !r.success()).findFirst()
                    .ifPresent(r -> sb.append("; erro em ").append(r.path()).append(": ").append(r.error()));
            return sb.toString();
        }

        private void moveAtomically(Path staging, Path destination) throws IOException {
            try {
                // Tenta rename atômico (rápido e seguro)
                Files.move(staging, destination, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                // Fallback para sistemas de arquivos que não suportam atomic move em diretórios
                Files.move(staging, destination, StandardCopyOption.REPLACE_EXISTING);
            }
        }

        private void cleanup(Path staging) {
            try {
                if (staging != null && Files.exists(staging)) {
                    Files.walk(staging)
                            .sorted(Comparator.reverseOrder())
                            .forEach(p -> { try { Files.deleteIfExists(p); } catch (IOException ignored) {} });
                }
            } catch (IOException ignored) {}
        }
    }
}
