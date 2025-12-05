package com.example.backupagent.packager;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.example.backupagent.scan.Scanner.FileMetadata;
import com.github.luben.zstd.ZstdInputStream;
import com.github.luben.zstd.ZstdOutputStream;

/**
 * Formato KBC (Keeply Backup Container) - formato binário com acesso aleatório aos chunks.
 * 
 * Estrutura:
 * - Header: "KBC\0" (4 bytes) + version (4 bytes int)
 * - Chunks: cada chunk comprimido individualmente com Zstd
 * - Índice: mapa de offsets/tamanhos dos chunks
 * - Footer: offset do índice (8 bytes long) + "KBC\0" (4 bytes)
 * 
 * Responsabilidades:
 * - Escrita (Writer): criar containers KBC
 * - Leitura (Reader): ler containers KBC com acesso aleatório
 */
public final class KbcFormat {

    private static final Logger log = LoggerFactory.getLogger(KbcFormat.class);
    private static final byte[] MAGIC = "KBC\0".getBytes(StandardCharsets.UTF_8);
    private static final int VERSION = 1;
    private static final int CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
    private static final HexFormat HEX = HexFormat.of();

    private KbcFormat() {}

    // ==================== TIPOS COMPARTILHADOS ====================

    /**
     * Container KBC completo.
     */
    public static final class Container {
        private final Path path;
        private final long size;
        private final String checksum;
        private final int filesIncluded;
        private final Map<String, List<ChunkEntry>> chunksByPath;
        private final Map<String, String> fileHashes;

        public Container(Path path, long size, String checksum, int filesIncluded,
                        Map<String, List<ChunkEntry>> chunksByPath, Map<String, String> fileHashes) {
            this.path = path;
            this.size = size;
            this.checksum = checksum;
            this.filesIncluded = filesIncluded;
            this.chunksByPath = Map.copyOf(chunksByPath);
            this.fileHashes = Map.copyOf(fileHashes);
        }

        public Path path() { return path; }
        public long size() { return size; }
        public String checksum() { return checksum; }
        public int filesIncluded() { return filesIncluded; }
        public Map<String, List<ChunkEntry>> chunksByPath() { return chunksByPath; }
        public Map<String, String> fileHashes() { return fileHashes; }
    }

    /**
     * Entrada de chunk no índice.
     */
    public static final class ChunkEntry {
        private final String hash;
        private final long offset;
        private final long originalSize;
        private final long compressedSize;

        public ChunkEntry(String hash, long offset, long originalSize, long compressedSize) {
            this.hash = hash;
            this.offset = offset;
            this.originalSize = originalSize;
            this.compressedSize = compressedSize;
        }

        public String hash() { return hash; }
        public long offset() { return offset; }
        public long originalSize() { return originalSize; }
        public long compressedSize() { return compressedSize; }
    }

    /**
     * Índice de um container KBC.
     */
    public static final class Index {
        private final List<ChunkEntry> entries;
        private final Map<String, List<ChunkEntry>> byPath;

        Index(List<ChunkEntry> entries, Map<String, List<ChunkEntry>> byPath) {
            this.entries = List.copyOf(entries);
            this.byPath = Map.copyOf(byPath);
        }

        public List<ChunkEntry> entries() { return entries; }
        public Map<String, List<ChunkEntry>> byPath() { return byPath; }
    }

    // ==================== WRITER (CRIAÇÃO) ====================

    /**
     * Writer para criar containers KBC.
     */
    public static final class Writer {
        private final int zstdLevel;
        private final String checksumAlgorithm;

        public Writer(int zstdLevel, String checksumAlgorithm) {
            this.zstdLevel = zstdLevel;
            this.checksumAlgorithm = Objects.requireNonNull(checksumAlgorithm);
        }

        /**
         * Cria um container KBC a partir dos arquivos escaneados.
         */
        public Container create(Path root, List<FileMetadata> files, String backupId, String manifestJson) throws IOException {
            Objects.requireNonNull(root, "root");
            Objects.requireNonNull(files, "files");

            long started = System.nanoTime();
            log.info("KBC Writer iniciado: root={}, arquivos={}", root, files.size());

            Path tempFile = Files.createTempFile("backup-" + backupId + "-", ".kbc");
            MessageDigest containerDigest = newDigest();

            Map<String, List<ChunkEntry>> allFileChunks = new HashMap<>();
            Map<String, String> fileHashes = new HashMap<>();
            List<IndexEntryInternal> globalIndex = new ArrayList<>();
            int includedCount = 0;
            int totalFiles = files.size();

            try (RandomAccessFile raf = new RandomAccessFile(tempFile.toFile(), "rw");
                 DigestOutputStream digestOut = new DigestOutputStream(
                         new BufferedOutputStream(new RandomAccessFileOutputStream(raf)), containerDigest)) {

                writeHeader(digestOut);

                // Manifest
                long manifestOffset = raf.getFilePointer();
                byte[] manifestBytes = (manifestJson != null ? manifestJson : "{}").getBytes(StandardCharsets.UTF_8);
                byte[] manifestCompressed = compressChunk(manifestBytes);
                digestOut.write(manifestCompressed);
                digestOut.flush();
                globalIndex.add(new IndexEntryInternal("manifest.json", manifestOffset, manifestBytes.length, manifestCompressed.length));

                // Arquivos
                for (FileMetadata meta : files) {
                    Path absPath = root.resolve(meta.relativePath());
                    if (!Files.exists(absPath) || !Files.isRegularFile(absPath)) continue;

                    String normPath = meta.normalizedPath();
                    if (includedCount % 10 == 0 || includedCount == totalFiles - 1) {
                        log.info("Empacotando {}/{}: {}", includedCount + 1, totalFiles, normPath);
                    }

                    try {
                        if (meta.wasModifiedSince(absPath)) {
                            log.warn("Arquivo {} modificado após scan. PULANDO.", normPath);
                            continue;
                        }
                    } catch (IOException e) {
                        log.warn("Arquivo {} não pôde ser verificado: {}", normPath, e.getMessage());
                        continue;
                    }

                    List<ChunkEntry> fileChunks = new ArrayList<>();
                    MessageDigest fileDigest = newDigest();
                    MessageDigest chunkDigest = newDigest();
                    byte[] buffer = new byte[CHUNK_SIZE];
                    long snapshotSize = meta.snapshotSize();

                try (InputStream in = new BufferedInputStream(Files.newInputStream(absPath))) {
                    long bytesRead = 0;
                    int read;

                    // Arquivo vazio: ainda registra entrada no índice para permitir restauração
                    if (snapshotSize == 0) {
                        chunkDigest.reset();
                        String chunkHash = HEX.formatHex(chunkDigest.digest()); // hash do vazio
                        long chunkOffset = raf.getFilePointer();
                        fileChunks.add(new ChunkEntry(chunkHash, chunkOffset, 0, 0));
                        globalIndex.add(new IndexEntryInternal(normPath, chunkOffset, 0, 0));
                    }

                    while (bytesRead < snapshotSize && (read = in.read(buffer, 0, (int)Math.min(buffer.length, snapshotSize - bytesRead))) != -1) {
                        chunkDigest.reset();
                        chunkDigest.update(buffer, 0, read);
                        String chunkHash = HEX.formatHex(chunkDigest.digest());
                        fileDigest.update(buffer, 0, read);

                            byte[] compressed = compressChunk(buffer, 0, read);
                            long chunkOffset = raf.getFilePointer();
                            digestOut.write(compressed);
                            digestOut.flush();

                            fileChunks.add(new ChunkEntry(chunkHash, chunkOffset, read, compressed.length));
                            globalIndex.add(new IndexEntryInternal(normPath, chunkOffset, read, compressed.length));
                            
                            bytesRead += read;
                        }
                    }

                    allFileChunks.put(normPath, fileChunks);
                    fileHashes.put(normPath, HEX.formatHex(fileDigest.digest()));
                    includedCount++;
                }

                // Índice
                long indexOffset = raf.getFilePointer();
                writeIndex(digestOut, globalIndex);

                // Footer
                writeFooter(digestOut, indexOffset);
                digestOut.flush();
            }

            long elapsedMs = (System.nanoTime() - started) / 1_000_000;
            long finalSize = Files.size(tempFile);
            String finalChecksum = HEX.formatHex(containerDigest.digest());

            log.info("KBC Writer concluído: arquivos={}, tamanho={}, tempo={} ms", includedCount, finalSize, elapsedMs);

            return new Container(tempFile, finalSize, finalChecksum, includedCount, allFileChunks, fileHashes);
        }

        private byte[] compressChunk(byte[] data) throws IOException {
            return compressChunk(data, 0, data.length);
        }

        private byte[] compressChunk(byte[] data, int offset, int length) throws IOException {
            try (ByteArrayOutputStream baos = new ByteArrayOutputStream();
                 ZstdOutputStream zstd = new ZstdOutputStream(baos, zstdLevel)) {
                zstd.write(data, offset, length);
                zstd.flush();
                zstd.close();
                return baos.toByteArray();
            }
        }

        private void writeHeader(OutputStream out) throws IOException {
            out.write(MAGIC);
            ByteBuffer buf = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN);
            buf.putInt(VERSION);
            out.write(buf.array());
        }

        private void writeIndex(OutputStream out, List<IndexEntryInternal> index) throws IOException {
            ByteBuffer buf = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN);
            buf.putInt(index.size());
            out.write(buf.array());

            for (IndexEntryInternal entry : index) {
                byte[] pathBytes = entry.path.getBytes(StandardCharsets.UTF_8);
                
                buf = ByteBuffer.allocate(2).order(ByteOrder.BIG_ENDIAN);
                buf.putShort((short)pathBytes.length);
                out.write(buf.array());
                
                out.write(pathBytes);
                
                buf = ByteBuffer.allocate(24).order(ByteOrder.BIG_ENDIAN);
                buf.putLong(entry.offset);
                buf.putLong(entry.originalSize);
                buf.putLong(entry.compressedSize);
                out.write(buf.array());
            }
        }

        private void writeFooter(OutputStream out, long indexOffset) throws IOException {
            ByteBuffer buf = ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN);
            buf.putLong(indexOffset);
            out.write(buf.array());
            out.write(MAGIC);
        }

        private MessageDigest newDigest() throws IOException {
            try {
                return MessageDigest.getInstance(checksumAlgorithm);
            } catch (NoSuchAlgorithmException e) {
                throw new IOException("Algoritmo de hash indisponível: " + checksumAlgorithm, e);
            }
        }

        private static final class IndexEntryInternal {
            final String path;
            final long offset;
            final long originalSize;
            final long compressedSize;

            IndexEntryInternal(String path, long offset, long originalSize, long compressedSize) {
                this.path = path;
                this.offset = offset;
                this.originalSize = originalSize;
                this.compressedSize = compressedSize;
            }
        }
    }

    // ==================== READER (LEITURA) ====================

    /**
     * Reader para ler containers KBC com acesso aleatório.
     */
    public static final class Reader implements AutoCloseable {
        private final RandomAccessFile raf;
        private final Index index;

        private Reader(RandomAccessFile raf, Index index) {
            this.raf = raf;
            this.index = index;
        }

        /**
         * Abre um container KBC para leitura.
         */
        public static Reader open(Path kbcFile) throws IOException {
            RandomAccessFile raf = new RandomAccessFile(kbcFile.toFile(), "r");
            
            try {
                // Header
                byte[] magic = new byte[4];
                raf.read(magic);
                if (!java.util.Arrays.equals(magic, MAGIC)) {
                    String magicHex = String.format("%02X %02X %02X %02X", magic[0], magic[1], magic[2], magic[3]);
                    String expectedHex = String.format("%02X %02X %02X %02X", MAGIC[0], MAGIC[1], MAGIC[2], MAGIC[3]);
                    throw new IOException("Arquivo KBC inválido: magic header incorreto. Arquivo: " + kbcFile + 
                                        ", Tamanho: " + java.nio.file.Files.size(kbcFile) + " bytes" +
                                        ", Encontrado: [" + magicHex + "], Esperado: [" + expectedHex + "]");
                }

                int version = raf.readInt();
                if (version != VERSION) {
                    throw new IOException("Versão KBC não suportada: " + version);
                }

                // Footer
                raf.seek(raf.length() - 12);
                long indexOffset = raf.readLong();
                raf.read(magic);
                if (!java.util.Arrays.equals(magic, MAGIC)) {
                    throw new IOException("Arquivo KBC inválido: magic footer incorreto");
                }

                // Índice
                raf.seek(indexOffset);
                Index index = readIndex(raf);

                log.info("Container KBC aberto: {} entradas", index.entries.size());
                return new Reader(raf, index);

            } catch (IOException e) {
                try { raf.close(); } catch (IOException ignored) {}
                throw e;
            }
        }

        private static Index readIndex(RandomAccessFile raf) throws IOException {
            int numEntries = raf.readInt();
            List<ChunkEntry> entries = new ArrayList<>(numEntries);
            Map<String, List<ChunkEntry>> byPath = new HashMap<>();

            for (int i = 0; i < numEntries; i++) {
                short pathLen = raf.readShort();
                byte[] pathBytes = new byte[pathLen];
                raf.readFully(pathBytes);
                String path = new String(pathBytes, StandardCharsets.UTF_8);

                long offset = raf.readLong();
                long originalSize = raf.readLong();
                long compressedSize = raf.readLong();

                ChunkEntry entry = new ChunkEntry("", offset, originalSize, compressedSize);
                entries.add(entry);
                byPath.computeIfAbsent(path, k -> new ArrayList<>()).add(entry);
            }

            return new Index(entries, byPath);
        }

        public Index getIndex() {
            return index;
        }

        /**
         * Lê um chunk específico (descomprimido).
         */
        public byte[] readChunk(ChunkEntry entry) throws IOException {
            synchronized (raf) {
                raf.seek(entry.offset);
                byte[] compressed = new byte[(int)entry.compressedSize];
                raf.readFully(compressed);

                try (ByteArrayInputStream bais = new ByteArrayInputStream(compressed);
                     ZstdInputStream zstd = new ZstdInputStream(bais)) {
                    return zstd.readAllBytes();
                }
            }
        }

        /**
         * Lê todos os chunks de um arquivo e retorna stream contínuo.
         */
        public InputStream readFile(String normalizedPath) throws IOException {
            List<ChunkEntry> chunks = index.byPath.get(normalizedPath);
            if (chunks == null || chunks.isEmpty()) {
                throw new IOException("Arquivo não encontrado no índice KBC: " + normalizedPath);
            }

            return new KbcFileInputStream(this, chunks);
        }

        /**
         * Retorna o conteúdo do manifest.json.
         */
        public String readManifest() throws IOException {
            List<ChunkEntry> manifestChunks = index.byPath.get("manifest.json");
            if (manifestChunks == null || manifestChunks.isEmpty()) {
                return "{}";
            }

            byte[] data = readChunk(manifestChunks.get(0));
            return new String(data, StandardCharsets.UTF_8);
        }

        @Override
        public void close() throws IOException {
            raf.close();
        }

        /**
         * InputStream que lê chunks sequencialmente.
         */
        private static final class KbcFileInputStream extends InputStream {
            private final Reader reader;
            private final List<ChunkEntry> chunks;
            private int currentChunkIndex;
            private ByteArrayInputStream currentChunkStream;

            KbcFileInputStream(Reader reader, List<ChunkEntry> chunks) {
                this.reader = reader;
                this.chunks = chunks;
                this.currentChunkIndex = 0;
            }

            @Override
            public int read() throws IOException {
                if (currentChunkStream == null || currentChunkStream.available() == 0) {
                    if (!loadNextChunk()) {
                        return -1;
                    }
                }
                return currentChunkStream.read();
            }

            @Override
            public int read(byte[] b, int off, int len) throws IOException {
                if (currentChunkStream == null || currentChunkStream.available() == 0) {
                    if (!loadNextChunk()) {
                        return -1;
                    }
                }
                return currentChunkStream.read(b, off, len);
            }

            private boolean loadNextChunk() throws IOException {
                if (currentChunkIndex >= chunks.size()) {
                    return false;
                }

                ChunkEntry chunk = chunks.get(currentChunkIndex++);
                byte[] data = reader.readChunk(chunk);
                currentChunkStream = new ByteArrayInputStream(data);
                return true;
            }

            @Override
            public void close() {
                // Não fecha o reader principal
            }
        }
    }

    // ==================== UTILITÁRIOS ====================

    /**
     * OutputStream wrapper para RandomAccessFile.
     */
    private static final class RandomAccessFileOutputStream extends OutputStream {
        private final RandomAccessFile raf;

        RandomAccessFileOutputStream(RandomAccessFile raf) {
            this.raf = raf;
        }

        @Override
        public void write(int b) throws IOException {
            raf.write(b);
        }

        @Override
        public void write(byte[] b) throws IOException {
            raf.write(b);
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            raf.write(b, off, len);
        }
    }
}
