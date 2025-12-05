package com.example.backupagent.packager;

import java.io.IOException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.example.backupagent.scan.Scanner.FileMetadata;

/**
 * Módulo de empacotamento - orquestra a criação de backups usando KbcFormat.
 * 
 * Responsabilidades:
 * - Multi-volume: dividir grandes conjuntos de arquivos em volumes menores
 * - Priorização: ordenar arquivos por importância
 * - Estimativa: calcular tamanho comprimido aproximado
 * - Validação: verificar espaço em disco
 */
public final class PackagerModule {

    private PackagerModule() {}

    /**
     * Container empacotado (wrapper sobre KbcFormat.Container).
     */
    public static final class PackagedContainer {
        private final Path path;
        private final long size;
        private final String checksum;
        private final int filesIncluded;
        private final Map<String, List<KbcFormat.ChunkEntry>> chunksByPath;
        private final Map<String, String> fileHashes;

        public PackagedContainer(Path path, long size, String checksum, int filesIncluded,
                                 Map<String, List<KbcFormat.ChunkEntry>> chunksByPath, Map<String, String> fileHashes) {
            this.path = path;
            this.size = size;
            this.checksum = checksum;
            this.filesIncluded = filesIncluded;
            this.chunksByPath = Collections.unmodifiableMap(chunksByPath);
            this.fileHashes = Collections.unmodifiableMap(fileHashes);
        }

        public Path path() { return path; }
        public long size() { return size; }
        public String checksum() { return checksum; }
        public int filesIncluded() { return filesIncluded; }
        public Map<String, List<KbcFormat.ChunkEntry>> getChunksByPath() { return chunksByPath; }
        public List<FileChunks> fileChunks() {
            List<FileChunks> list = new ArrayList<>();
            chunksByPath.forEach((filePath, chunks) -> list.add(new FileChunks(filePath, chunks, fileHashes.get(filePath))));
            return list;
        }

        public static final class FileChunks {
            private final String path;
            private final List<KbcFormat.ChunkEntry> chunks;
            private final String fileHash;
            public FileChunks(String path, List<KbcFormat.ChunkEntry> chunks, String fileHash) {
                this.path = path; this.chunks = List.copyOf(chunks); this.fileHash = fileHash;
            }
            public String path() { return path; }
            public List<KbcFormat.ChunkEntry> chunks() { return chunks; }
            public List<String> chunkHashes() { return chunks.stream().map(KbcFormat.ChunkEntry::hash).toList(); }
            public Optional<String> fileHash() { return Optional.ofNullable(fileHash); }
        }
    }

    /**
     * Packager simples (não multi-volume).
     */
    public static final class Packager {

        private static final Logger log = LoggerFactory.getLogger(Packager.class);
        private final int zstdLevel;
        private final String checksumAlgorithm;

        public Packager(String checksumAlgorithm) {
            this(3, checksumAlgorithm);
        }

        public Packager(int zstdLevel, String checksumAlgorithm) {
            this.zstdLevel = zstdLevel;
            this.checksumAlgorithm = Objects.requireNonNull(checksumAlgorithm);
        }

        /**
         * Cria um container KBC.
         */
        public PackagedContainer create(Path root, List<FileMetadata> files, String backupId, String manifestJson) throws IOException {
            KbcFormat.Writer writer = new KbcFormat.Writer(zstdLevel, checksumAlgorithm);
            KbcFormat.Container container = writer.create(root, files, backupId, manifestJson);
            
            return new PackagedContainer(
                container.path(),
                container.size(),
                container.checksum(),
                container.filesIncluded(),
                container.chunksByPath(),
                container.fileHashes()
            );
        }
    }

    /**
     * Empacotador multi-volume que orquestra o {@link Packager} existente:
     * - divide a lista de arquivos em volumes menores (maxContainerBytes);
     * - prioriza arquivos mais importantes primeiro;
     * - estima tamanho comprimido e checa espaço livre;
     * - retorna uma lista de {@link PackagedContainer}.
     *
     * Transparente para Uploader / Storage.
     */
    public static final class MultiVolumePackager {

        private static final Logger log = LoggerFactory.getLogger(MultiVolumePackager.class);

        private final Packager delegate;
        private final long maxContainerBytes;

        // Extensões usadas em prioridade e heurística de compressão
        private static final Set<String> DOC_EXT = Set.of(
                "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
                "odt", "ods", "odp", "rtf", "txt", "md"
        );
        private static final Set<String> CODE_EXT = Set.of(
                "java", "kt", "kts", "scala",
                "py", "rb", "php",
                "js", "ts", "tsx", "jsx",
                "c", "h", "cpp", "cc", "hpp",
                "cs", "go", "rs",
                "html", "css", "scss", "less",
                "json", "xml", "yml", "yaml", "toml"
        );
        private static final Set<String> CONFIG_EXT = Set.of(
                "ini", "cfg", "conf", "properties", "env"
        );
        private static final Set<String> DB_EXT = Set.of(
                "db", "sqlite", "sqlite3", "mdb", "accdb", "sql"
        );
        private static final Set<String> EXEC_EXT = Set.of(
                "exe", "dll", "sys", "msi", "drv", "efi"
        );
        private static final Set<String> MEDIA_EXT = Set.of(
                // vídeo
                "mp4", "mkv", "avi", "mov", "wmv", "flv",
                // áudio
                "mp3", "aac", "flac", "ogg", "wav",
                // imagem
                "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "heic",
                // compactados
                "zip", "rar", "7z", "gz", "bz2", "xz"
        );

        private enum ContentCategory {
            TEXT, BINARY, MEDIA
        }

        private static final class PrioritizedFile {
            final FileMetadata meta;
            final int priority;
            final long estimatedCompressedBytes;

            PrioritizedFile(FileMetadata meta, int priority, long estimatedCompressedBytes) {
                this.meta = meta;
                this.priority = priority;
                this.estimatedCompressedBytes = estimatedCompressedBytes;
            }
        }

        public MultiVolumePackager(Packager delegate, long maxContainerBytes) {
            if (maxContainerBytes <= 0) {
                throw new IllegalArgumentException("maxContainerBytes deve ser > 0");
            }
            this.delegate = Objects.requireNonNull(delegate, "delegate");
            this.maxContainerBytes = maxContainerBytes;
        }

        /**
         * Cria múltiplos containers a partir de um conjunto de arquivos.
         *
         * - Respeita o limite de tamanho de cada volume (maxContainerBytes);
         * - Prioriza arquivos críticos primeiro;
         * - Nomeia volumes como backupId-vol1, backupId-vol2, etc.;
         * - Loga progresso em nível de volume.
         */
        public List<PackagedContainer> createMultiVolume(Path root,
                                                         List<FileMetadata> files,
                                                         String backupId,
                                                         String manifestJson) throws IOException {
            Objects.requireNonNull(root, "root");
            Objects.requireNonNull(files, "files");
            Objects.requireNonNull(backupId, "backupId");

            if (files.isEmpty()) {
                log.info("Nenhum arquivo para empacotar no backup {} (lista vazia).", backupId);
                return Collections.emptyList();
            }

            long estimatedTotalCompressed = estimateTotalCompressedSize(root, files);
            long usable = getUsableSpaceForTemp();

            if (usable > 0 && estimatedTotalCompressed > usable) {
                log.warn(
                        "Espaço em disco possivelmente insuficiente para backup {}: estimado ~{} bytes, disponível {} bytes.",
                        backupId, estimatedTotalCompressed, usable
                );
            } else if (usable > 0) {
                log.info("Tamanho estimado comprimido para backup {}: ~{} bytes (livre no tmp: {}).",
                        backupId, estimatedTotalCompressed, usable);
            } else {
                log.info("Tamanho estimado comprimido para backup {}: ~{} bytes (espaço livre não pôde ser determinado).",
                        backupId, estimatedTotalCompressed);
            }

            List<List<FileMetadata>> batches = splitIntoBatches(root, files);
            int totalVolumes = batches.size();

            log.info("Backup {} será dividido em {} volume(s) (limite por volume: {}).",
                    backupId, totalVolumes, humanReadableSize(maxContainerBytes));

            List<PackagedContainer> result = new ArrayList<>(totalVolumes);

            for (int i = 0; i < totalVolumes; i++) {
                List<FileMetadata> batch = batches.get(i);
                String volumeId = backupId + "-vol" + (i + 1);

                log.info("Iniciando criação do volume {}/{} ({} arquivos)...",
                        i + 1, totalVolumes, batch.size());

                PackagedContainer container = delegate.create(root, batch, volumeId, manifestJson);
                result.add(container);

                String prettySize = humanReadableSize(container.size());
                log.info("Volume {}/{} criado: {} arquivos, {} (path={})",
                        i + 1, totalVolumes, container.filesIncluded(), prettySize, container.path());
            }

            return Collections.unmodifiableList(result);
        }

        /**
         * Define a prioridade de um arquivo (0 a 100) com base em:
         * - caminho (Desktop, Downloads, Documents, AppData, Program Files etc);
         * - extensão (documentos, código, configs, DB, executáveis, mídia comprimida).
         */
        public int getPriority(FileMetadata meta) {
            String normalized = meta.normalizedPath().toLowerCase(Locale.ROOT);

            // Extensão
            String fileName = meta.relativePath().getFileName().toString();
            String ext = "";
            int dot = fileName.lastIndexOf('.');
            if (dot > 0 && dot < fileName.length() - 1) {
                ext = fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
            }

            int priority = 50; // padrão

            if (DOC_EXT.contains(ext)) {
                priority = 95; // documentos do usuário
            } else if (CODE_EXT.contains(ext)) {
                priority = 75; // código fonte / configs estruturadas
            } else if (CONFIG_EXT.contains(ext)) {
                priority = 65; // configs
            } else if (DB_EXT.contains(ext)) {
                priority = 68; // bancos / dados
            } else if (EXEC_EXT.contains(ext)) {
                priority = 25; // executáveis / dll
            } else if (MEDIA_EXT.contains(ext)) {
                priority = 8;  // mídia já comprimida
            }

            // Ajustes por localização no caminho

            // Documentos do usuário / Desktop / Downloads
            if (containsAny(normalized,
                    "/desktop/", "/documents/", "/documentos/",
                    "/downloads/", "/transferências/",
                    "\\desktop\\", "\\documents\\", "\\documentos\\",
                    "\\downloads\\", "\\transferências\\")) {
                priority = Math.max(priority, 95);
            }

            // AppData/Roaming (configs de usuário)
            if (containsAny(normalized,
                    "/appdata/roaming/", "\\appdata\\roaming\\")) {
                priority = Math.max(priority, 75);
            }

            // Program Files / diretórios de sistema -> baixa prioridade
            if (containsAny(normalized,
                    "/program files/", "\\program files\\",
                    "/windows/", "\\windows\\")) {
                priority = Math.min(priority, 30);
            }

            // Clampa 0..100
            if (priority < 0) priority = 0;
            if (priority > 100) priority = 100;
            return priority;
        }

        /**
         * Estima o tamanho total comprimido de um conjunto de arquivos,
         * usando heurísticas por tipo de conteúdo:
         * - texto: ~30% do original (70% de ganho);
         * - binário: ~60%;
         * - mídia comprimida: ~95%.
         */
        public long estimateTotalCompressedSize(Path root, List<FileMetadata> files) {
            long sum = 0L;
            for (FileMetadata meta : files) {
                sum += estimateCompressedSize(root, meta);
            }
            return sum;
        }

        // ---------- Internos ----------

        private List<List<FileMetadata>> splitIntoBatches(Path root, List<FileMetadata> files) {
            List<PrioritizedFile> prioritized = new ArrayList<>(files.size());

            for (FileMetadata meta : files) {
                int priority = getPriority(meta);
                long estCompressed = estimateCompressedSize(root, meta);
                prioritized.add(new PrioritizedFile(meta, priority, estCompressed));
            }

            // Ordena: maior prioridade primeiro; empatou, menor tamanho estimado primeiro
            prioritized.sort(Comparator
                    .comparingInt((PrioritizedFile pf) -> pf.priority).reversed()
                    .thenComparingLong(pf -> pf.estimatedCompressedBytes));

            List<List<FileMetadata>> batches = new ArrayList<>();
            List<FileMetadata> current = new ArrayList<>();
            long currentSize = 0L;

            for (PrioritizedFile pf : prioritized) {
                long estSize = pf.estimatedCompressedBytes;

                // Se um único arquivo já passa do limite, coloca sozinho num volume
                if (estSize > maxContainerBytes) {
                    log.warn(
                            "Arquivo {} (~{} bytes estimados) excede limite de volume {}. " +
                            "Ele será colocado em volume próprio.",
                            pf.meta.normalizedPath(), estSize, maxContainerBytes
                    );
                    if (!current.isEmpty()) {
                        batches.add(current);
                        current = new ArrayList<>();
                        currentSize = 0L;
                    }
                    List<FileMetadata> single = new ArrayList<>();
                    single.add(pf.meta);
                    batches.add(single);
                    continue;
                }

                // Se não cabe no volume atual, fecha e abre outro
                if (!current.isEmpty() && currentSize + estSize > maxContainerBytes) {
                    batches.add(current);
                    current = new ArrayList<>();
                    currentSize = 0L;
                }

                current.add(pf.meta);
                currentSize += estSize;
            }

            if (!current.isEmpty()) {
                batches.add(current);
            }

            return batches;
        }

        private long estimateCompressedSize(Path root, FileMetadata meta) {
            ContentCategory category = classifyContent(root, meta);
            double factor;
            switch (category) {
                case TEXT -> factor = 0.30;   // 70% de ganho
                case BINARY -> factor = 0.60; // 40% de ganho
                case MEDIA -> factor = 0.95;  // quase nada
                default -> factor = 0.60;
            }

            long original = meta.size();
            long estimated = (long) Math.ceil(original * factor);
            if (estimated <= 0L) estimated = 1L;
            return estimated;
        }

        private ContentCategory classifyContent(Path root, FileMetadata meta) {
            Path abs = root.resolve(meta.relativePath());
            String mime = null;
            try {
                mime = Files.probeContentType(abs);
            } catch (IOException e) {
                if (log.isDebugEnabled()) {
                    log.debug("Falha ao detectar MIME para {}: {}", abs, e.toString());
                }
            }

            String normalized = meta.normalizedPath().toLowerCase(Locale.ROOT);
            String ext = extractExtension(normalized);

            // MIME primeiro
            if (mime != null) {
                if (mime.startsWith("text/")) {
                    return ContentCategory.TEXT;
                }
                if (mime.equals("application/json") ||
                    mime.equals("application/xml") ||
                    mime.equals("application/x-yaml") ||
                    mime.equals("application/yaml")) {
                    return ContentCategory.TEXT;
                }
                if (mime.startsWith("image/") ||
                    mime.startsWith("audio/") ||
                    mime.startsWith("video/")) {
                    return ContentCategory.MEDIA;
                }
            }

            // Fallback por extensão
            if (DOC_EXT.contains(ext) || CODE_EXT.contains(ext) ||
                    CONFIG_EXT.contains(ext) || DB_EXT.contains(ext)) {
                return ContentCategory.TEXT;
            }
            if (MEDIA_EXT.contains(ext)) {
                return ContentCategory.MEDIA;
            }

            return ContentCategory.BINARY;
        }

        private long getUsableSpaceForTemp() {
            String tmpProp = System.getProperty("java.io.tmpdir");
            Path tmpDir;
            try {
                if (tmpProp != null && !tmpProp.isBlank()) {
                    tmpDir = Path.of(tmpProp).toAbsolutePath().normalize();
                } else {
                    tmpDir = Path.of(".").toAbsolutePath().normalize();
                }
                Files.createDirectories(tmpDir);
                FileStore store = Files.getFileStore(tmpDir);
                return store.getUsableSpace();
            } catch (IOException e) {
                log.warn("Não foi possível determinar espaço livre no diretório temporário: {}", e.toString());
                return -1L;
            }
        }

        private static boolean containsAny(String text, String... needles) {
            for (String n : needles) {
                if (text.contains(n)) return true;
            }
            return false;
        }

        private static String extractExtension(String normalizedPath) {
            int slash = normalizedPath.lastIndexOf('/');
            String name = (slash >= 0) ? normalizedPath.substring(slash + 1) : normalizedPath;
            int dot = name.lastIndexOf('.');
            if (dot > 0 && dot < name.length() - 1) {
                return name.substring(dot + 1).toLowerCase(Locale.ROOT);
            }
            return "";
        }

        private static String humanReadableSize(long bytes) {
            if (bytes < 1024) {
                return bytes + " B";
            }
            double val = bytes;
            String[] units = {"KB", "MB", "GB", "TB", "PB"};
            int idx = 0;
            while (val >= 1024 && idx < units.length - 1) {
                val /= 1024;
                idx++;
            }
            return String.format(Locale.ROOT, "%.2f %s", val, units[idx]);
        }
    }
}
