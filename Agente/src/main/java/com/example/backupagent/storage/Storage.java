package com.example.backupagent.storage;

import com.example.backupagent.config.AppConfig;
import java.io.IOException;
import java.io.InputStream;
import java.util.Objects;
import java.util.Optional;

/**
 * Centraliza abstrações e utilitários relacionados aos backends de storage.
 */
public final class Storage {

    private Storage() {}

    /** Abstração mínima para operações de leitura e validação no storage. */
    public interface ObjectStore extends AutoCloseable {

        Optional<ObjectStat> stat(String key) throws IOException;

        default boolean exists(String key) throws IOException {
            return stat(key).isPresent();
        }

        InputStream readRange(String key, long startInclusive, long endInclusive) throws IOException;

        @Override
        default void close() throws Exception {
            // default no-op
        }

        final class ObjectStat {
            private final long size;
            private final String eTag;

            public ObjectStat(long size, String eTag) {
                this.size = size;
                this.eTag = eTag;
            }

            public long size() { return size; }
            public String eTag() { return eTag; }
        }
    }

    /**
     * ObjectStore que delega para S3 ou Local com base no prefixo do key (s3:/local:).
     */
    public static final class CompositeObjectStore implements ObjectStore {

        private final ObjectStore s3;
        private final ObjectStore local;

        public CompositeObjectStore(AppConfig config, LocalBackupLocation location) {
            this(new S3ObjectStore(config), new LocalObjectStore(location));
        }

        public CompositeObjectStore(ObjectStore s3, ObjectStore local) {
            this.s3 = Objects.requireNonNull(s3, "s3");
            this.local = Objects.requireNonNull(local, "local");
        }

        @Override
        public Optional<ObjectStat> stat(String key) throws IOException {
            StorageBackend.fromQualifiedKey(key); // valida prefixo conhecido
            String raw = StorageBackend.stripQualifier(key);
            if (key.startsWith("local:")) {
                return local.stat(raw);
            } else if (key.startsWith("s3:")) {
                return s3.stat(raw);
            }
            Optional<ObjectStat> s3Stat = s3.stat(raw);
            return s3Stat.isPresent() ? s3Stat : local.stat(raw);
        }

        @Override
        public InputStream readRange(String key, long startInclusive, long endInclusive) throws IOException {
            String raw = StorageBackend.stripQualifier(key);
            if (key.startsWith("local:")) {
                return local.readRange(raw, startInclusive, endInclusive);
            } else if (key.startsWith("s3:")) {
                return s3.readRange(raw, startInclusive, endInclusive);
            }
            try {
                return s3.readRange(raw, startInclusive, endInclusive);
            } catch (IOException e) {
                return local.readRange(raw, startInclusive, endInclusive);
            }
        }

        @Override
        public void close() throws Exception {
            try { s3.close(); } catch (Exception ignore) {}
            try { local.close(); } catch (Exception ignore) {}
        }
    }

    // ---- Local backup location -------------------------------------------

    public static final class LocalBackupLocation {
        private static final java.util.logging.Logger LOGGER = java.util.logging.Logger.getLogger(LocalBackupLocation.class.getName());
        private final java.nio.file.Path stateFile;
        private final java.nio.file.Path defaultDir;
        private volatile java.nio.file.Path current;

        public LocalBackupLocation(String defaultDir) {
            this(defaultDir, java.nio.file.Path.of(System.getProperty("user.home"), ".keeply", "local-backup-dir.txt"));
        }

        public LocalBackupLocation(String defaultDir, java.nio.file.Path stateFile) {
            this.stateFile = Objects.requireNonNull(stateFile, "stateFile");
            this.defaultDir = normalize(java.nio.file.Path.of(Objects.requireNonNull(defaultDir, "defaultDir")));
            this.current = loadOrDefault();
        }

        public java.nio.file.Path current() { return current; }

        public synchronized void update(java.nio.file.Path newBase) throws IOException {
            java.nio.file.Path normalized = normalize(newBase);
            java.nio.file.Files.createDirectories(normalized);
            this.current = normalized;
            persist();
        }

        private java.nio.file.Path loadOrDefault() {
            if (java.nio.file.Files.exists(stateFile)) {
                try {
                    String raw = java.nio.file.Files.readString(stateFile, java.nio.charset.StandardCharsets.UTF_8).trim();
                    if (!raw.isBlank()) {
                        java.nio.file.Path stored = normalize(java.nio.file.Path.of(raw));
                        java.nio.file.Files.createDirectories(stored);
                        return stored;
                    }
                } catch (IOException e) {
                    LOGGER.warning(() -> "Nao foi possivel ler destino local persistido: " + e.getMessage());
                }
            }
            try {
                java.nio.file.Files.createDirectories(defaultDir);
            } catch (IOException e) {
                LOGGER.warning(() -> "Nao foi possivel criar diretório padrão de backup local: " + e.getMessage());
            }
            return defaultDir;
        }

        private void persist() throws IOException {
            if (stateFile.getParent() != null) {
                java.nio.file.Files.createDirectories(stateFile.getParent());
            }
            java.nio.file.Files.writeString(stateFile, current.toString(), java.nio.charset.StandardCharsets.UTF_8);
        }

        private java.nio.file.Path normalize(java.nio.file.Path path) {
            return path.toAbsolutePath().normalize();
        }
    }

    // ---- Local ObjectStore -----------------------------------------------

    public static final class LocalObjectStore implements ObjectStore {
        private final LocalBackupLocation location;

        public LocalObjectStore(LocalBackupLocation location) { this.location = Objects.requireNonNull(location, "location"); }

        @Override
        public Optional<ObjectStore.ObjectStat> stat(String key) throws IOException {
            java.nio.file.Path path = location.current().resolve(key);
            if (!java.nio.file.Files.exists(path)) return Optional.empty();
            long size = java.nio.file.Files.size(path);
            return Optional.of(new ObjectStore.ObjectStat(size, null));
        }

        @Override
        public InputStream readRange(String key, long startInclusive, long endInclusive) throws IOException {
            if (startInclusive < 0 || endInclusive < startInclusive) throw new IllegalArgumentException("Range inválido: " + startInclusive + "-" + endInclusive);
            java.nio.file.Path path = location.current().resolve(key);
            if (!java.nio.file.Files.exists(path)) throw new IOException("Arquivo não encontrado: " + path);
            
            // Se endInclusive é Long.MAX_VALUE, lê o arquivo completo
            if (endInclusive == Long.MAX_VALUE) {
                InputStream fileStream = java.nio.file.Files.newInputStream(path);
                if (startInclusive > 0) {
                    fileStream.skip(startInclusive);
                }
                return fileStream;
            }
            
            long length = endInclusive - startInclusive + 1;
            java.nio.channels.SeekableByteChannel channel = java.nio.file.Files.newByteChannel(path, java.util.EnumSet.of(java.nio.file.StandardOpenOption.READ));
            channel.position(startInclusive);
            return java.nio.channels.Channels.newInputStream(new BoundedChannel(channel, length));
        }

        private static final class BoundedChannel implements java.nio.channels.ReadableByteChannel {
            private final java.nio.channels.SeekableByteChannel delegate;
            private long remaining;
            private boolean open = true;
            BoundedChannel(java.nio.channels.SeekableByteChannel delegate, long remaining) { this.delegate = delegate; this.remaining = remaining; }
            @Override public int read(java.nio.ByteBuffer dst) throws IOException {
                if (!open || remaining <= 0) return -1;
                int toRead = (int) Math.min(dst.remaining(), remaining);
                int oldLimit = dst.limit();
                dst.limit(dst.position() + toRead);
                int read = delegate.read(dst);
                dst.limit(oldLimit);
                if (read > 0) remaining -= read;
                return read;
            }
            @Override public boolean isOpen() { return open && delegate.isOpen(); }
            @Override public void close() throws IOException { open = false; delegate.close(); }
        }
    }

    // ---- S3 ObjectStore --------------------------------------------------

    public static final class S3ObjectStore implements ObjectStore {
        private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(S3ObjectStore.class);
        private final AppConfig config;
        private volatile software.amazon.awssdk.services.s3.S3Client client;

        public S3ObjectStore(AppConfig config) { this(config, createClient(config)); }
        public S3ObjectStore(AppConfig config, software.amazon.awssdk.services.s3.S3Client client) {
            this.config = Objects.requireNonNull(config, "config");
            this.client = Objects.requireNonNull(client, "client");
        }

        @Override
        public Optional<ObjectStore.ObjectStat> stat(String key) throws IOException {
            try {
                software.amazon.awssdk.services.s3.model.HeadObjectResponse head = client.headObject(software.amazon.awssdk.services.s3.model.HeadObjectRequest.builder()
                        .bucket(config.awsBucket())
                        .key(key)
                        .build());
                if (head == null) return Optional.empty();
                return Optional.of(new ObjectStore.ObjectStat(head.contentLength(), head.eTag()));
            } catch (software.amazon.awssdk.services.s3.model.NoSuchKeyException e) {
                return Optional.empty();
            } catch (software.amazon.awssdk.core.exception.SdkClientException e) {
                throw new IOException("Falha no HEAD de " + key + ": " + e.getMessage(), e);
            }
        }

        @Override
        public InputStream readRange(String key, long startInclusive, long endInclusive) throws IOException {
            if (startInclusive < 0 || endInclusive < startInclusive) throw new IllegalArgumentException("Range inválido: " + startInclusive + "-" + endInclusive);
            String range = "bytes=" + startInclusive + "-" + endInclusive;
            software.amazon.awssdk.services.s3.model.GetObjectRequest request = software.amazon.awssdk.services.s3.model.GetObjectRequest.builder()
                    .bucket(config.awsBucket()).key(key).range(range).build();
            try {
                software.amazon.awssdk.core.ResponseInputStream<software.amazon.awssdk.services.s3.model.GetObjectResponse> stream = client.getObject(request);
                return new AutoCloseInputStream(stream);
            } catch (software.amazon.awssdk.core.exception.SdkClientException e) {
                throw new IOException("Falha ao ler range " + range + " de " + key + ": " + e.getMessage(), e);
            }
        }

        @Override public void close() { try { client.close(); } catch (Exception e) { log.warn("Falha ao fechar S3Client: {}", e.getMessage()); } }

        public static software.amazon.awssdk.services.s3.S3Client createClient(AppConfig config) {
            software.amazon.awssdk.auth.credentials.AwsCredentialsProvider provider = credentials(config);
            software.amazon.awssdk.services.s3.S3ClientBuilder builder = software.amazon.awssdk.services.s3.S3Client.builder()
                    .region(software.amazon.awssdk.regions.Region.of(config.awsRegion()))
                    .credentialsProvider(provider)
                    .serviceConfiguration(software.amazon.awssdk.services.s3.S3Configuration.builder().checksumValidationEnabled(false).build());
            config.awsEndpointOverride().ifPresent(endpoint -> builder.endpointOverride(java.net.URI.create(endpoint)));
            return builder.build();
        }

        private static software.amazon.awssdk.auth.credentials.AwsCredentialsProvider credentials(AppConfig config) {
            if (config.awsAccessKeyId().isPresent() && config.awsSecretAccessKey().isPresent()) {
                if (config.awsSessionToken().isPresent()) {
                    software.amazon.awssdk.auth.credentials.AwsSessionCredentials session = software.amazon.awssdk.auth.credentials.AwsSessionCredentials.create(
                            config.awsAccessKeyId().get(), config.awsSecretAccessKey().get(), config.awsSessionToken().get());
                    return software.amazon.awssdk.auth.credentials.StaticCredentialsProvider.create(session);
                }
                software.amazon.awssdk.auth.credentials.AwsBasicCredentials basic = software.amazon.awssdk.auth.credentials.AwsBasicCredentials.create(
                        config.awsAccessKeyId().get(), config.awsSecretAccessKey().get());
                return software.amazon.awssdk.auth.credentials.StaticCredentialsProvider.create(basic);
            }
            return software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider.create();
        }

        public void updateClient(software.amazon.awssdk.services.s3.S3Client client) {
            Objects.requireNonNull(client, "client");
            software.amazon.awssdk.services.s3.S3Client previous = this.client;
            this.client = client;
            if (previous != null && previous != client) { try { previous.close(); } catch (Exception ignore) {} }
        }

        private static final class AutoCloseInputStream extends InputStream {
            private final software.amazon.awssdk.core.ResponseInputStream<software.amazon.awssdk.services.s3.model.GetObjectResponse> delegate;
            private AutoCloseInputStream(software.amazon.awssdk.core.ResponseInputStream<software.amazon.awssdk.services.s3.model.GetObjectResponse> delegate) { this.delegate = delegate; }
            @Override public int read() throws IOException { return delegate.read(); }
            @Override public int read(byte[] b, int off, int len) throws IOException { return delegate.read(b, off, len); }
            @Override public void close() throws IOException { delegate.close(); }
        }
    }

    // ---- S3 Uploader -----------------------------------------------------

    public static final class S3Uploader implements Uploader {
        private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(S3Uploader.class);
        private final AppConfig config;
        private volatile software.amazon.awssdk.services.s3.S3Client s3Client;
        private final long multipartThreshold;
        private final long partSize;

        public S3Uploader(AppConfig config) { this(config, createClient(config)); }
        public S3Uploader(AppConfig config, software.amazon.awssdk.services.s3.S3Client client) {
            this.config = Objects.requireNonNull(config, "config");
            this.s3Client = Objects.requireNonNull(client, "client");
            this.multipartThreshold = config.multipartThresholdBytes();
            this.partSize = config.multipartPartSizeBytes();
        }

        @Override
        public UploadResult upload(java.nio.file.Path container, long size, String sessionId, java.util.UUID backupId, String checksum) throws IOException {
            Objects.requireNonNull(container, "container"); Objects.requireNonNull(sessionId, "sessionId"); Objects.requireNonNull(backupId, "backupId"); Objects.requireNonNull(checksum, "checksum");
            String key = key(sessionId, backupId);
            if (exists(key)) { log.info("Objeto {} já presente no bucket {} - reutilizando", key, config.awsBucket()); return new UploadResult(config.awsBucket(), key, null, size, true); }
            if (size <= multipartThreshold) { log.info("Upload simples para {} ({} bytes)", key, size); String etag = putObject(container, size, key, checksum); return new UploadResult(config.awsBucket(), key, etag, size, false); }
            log.info("Upload multipart para {} ({} bytes, partSize={} bytes)", key, size, partSize);
            String etag = multipartUpload(container, size, key, checksum);
            return new UploadResult(config.awsBucket(), key, etag, size, false);
        }

        private boolean exists(String key) {
            try {
                software.amazon.awssdk.services.s3.model.HeadObjectResponse response = s3Client.headObject(software.amazon.awssdk.services.s3.model.HeadObjectRequest.builder().bucket(config.awsBucket()).key(key).build());
                return response != null;
            } catch (software.amazon.awssdk.services.s3.model.NoSuchKeyException e) { return false; }
            catch (software.amazon.awssdk.services.s3.model.S3Exception e) { if (e.statusCode() == 404) return false; throw e; }
        }

        private String putObject(java.nio.file.Path file, long size, String key, String checksum) throws IOException {
            int maxAttempts = 3;
            long backoffMillis = 1000L;
            for (int attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    return putObjectOnce(file, size, key, checksum);
                } catch (software.amazon.awssdk.core.exception.AbortedException aborted) {
                    boolean interrupted = Thread.interrupted() || Thread.currentThread().isInterrupted();
                    if (interrupted) {
                        Thread.currentThread().interrupt();
                    }
                    String msg = interrupted
                            ? "thread interrompida durante upload"
                            : "requisicao abortada (" + errorMessage(aborted) + ")";
                    if (attempt >= maxAttempts || interrupted) {
                        throw new IOException("Falha no upload para " + key + ": " + msg, aborted);
                    }
                    log.warn("Upload abortado para {} (tentativa {}/{}). Retentando em {} ms...", key, attempt, maxAttempts, backoffMillis);
                    sleepQuietly(backoffMillis);
                    backoffMillis = Math.min(backoffMillis * 2, 8000L);
                } catch (software.amazon.awssdk.core.exception.SdkException e) {
                    String msg = errorMessage(e);
                    if (attempt >= maxAttempts) {
                        throw new IOException("Falha no upload para " + key + ": " + msg, e);
                    }
                    log.warn("Falha no upload para {} (tentativa {}/{}): {}. Retentando em {} ms...", key, attempt, maxAttempts, msg, backoffMillis);
                    sleepQuietly(backoffMillis);
                    backoffMillis = Math.min(backoffMillis * 2, 8000L);
                }
            }
            throw new IOException("Falha no upload para " + key + ": tentativas esgotadas");
        }

        private String putObjectOnce(java.nio.file.Path file, long size, String key, String checksum) throws IOException {
            software.amazon.awssdk.services.s3.model.PutObjectRequest.Builder builder = software.amazon.awssdk.services.s3.model.PutObjectRequest.builder()
                    .bucket(config.awsBucket()).key(key).contentLength(size).contentType("application/zstd").metadata(metadata(checksum));
            applyEncryption(builder);
            try (java.io.InputStream in = java.nio.file.Files.newInputStream(file)) {
                return s3Client.putObject(builder.build(), software.amazon.awssdk.core.sync.RequestBody.fromInputStream(in, size)).eTag();
            }
        }

        private String multipartUpload(java.nio.file.Path file, long size, String key, String checksum) throws IOException {
            software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest.Builder reqBuilder = software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest.builder()
                    .bucket(config.awsBucket()).key(key).contentType("application/zstd").metadata(metadata(checksum));
            applyEncryption(reqBuilder);
            software.amazon.awssdk.services.s3.model.CreateMultipartUploadResponse created;
            try { created = s3Client.createMultipartUpload(reqBuilder.build()); }
            catch (software.amazon.awssdk.core.exception.SdkException e) { throw new IOException("Não foi possível iniciar MPU para " + key + ": " + e.getMessage(), e); }
            String uploadId = created.uploadId();
            try (java.io.InputStream in = java.nio.file.Files.newInputStream(file)) {
                long remaining = size; int partNumber = 1; byte[] buffer = new byte[(int) Math.min(partSize, Integer.MAX_VALUE)]; java.util.List<software.amazon.awssdk.services.s3.model.CompletedPart> parts = new java.util.ArrayList<>();
                long totalParts = (size + partSize - 1) / partSize;
                while (remaining > 0) {
                    // Verifica se a thread foi interrompida antes de continuar
                    if (Thread.currentThread().isInterrupted()) {
                        log.warn("Upload multipart interrompido para {}", key);
                        throw new InterruptedException("Upload cancelado ou thread interrompida");
                    }
                    
                    int toRead = (int) Math.min(buffer.length, remaining);
                    int read = in.readNBytes(buffer, 0, toRead);
                    if (read <= 0) break;
                    
                    software.amazon.awssdk.services.s3.model.UploadPartRequest partRequest = software.amazon.awssdk.services.s3.model.UploadPartRequest.builder()
                            .bucket(config.awsBucket()).key(key).uploadId(uploadId).partNumber(partNumber).contentLength((long) read).build();
                    
                    try {
                        software.amazon.awssdk.services.s3.model.UploadPartResponse response = s3Client.uploadPart(partRequest, software.amazon.awssdk.core.sync.RequestBody.fromBytes(java.util.Arrays.copyOf(buffer, read)));
                        double progress = (100.0 * partNumber) / totalParts;
                        log.info("Parte {}/{} enviada ({} bytes, {:.1f}% concluído)", partNumber, totalParts, read, progress);
                        parts.add(software.amazon.awssdk.services.s3.model.CompletedPart.builder().partNumber(partNumber).eTag(response.eTag()).build());
                    } catch (software.amazon.awssdk.core.exception.AbortedException aborted) {
                        log.error("Upload abortado na parte {} de {}: Thread interrompida", partNumber, key);
                        throw new InterruptedException("Upload abortado: " + aborted.getClass().getSimpleName());
                    }
                    
                    remaining -= read; partNumber++;
                }
                
                log.info("Finalizando upload multipart para {} ({} partes)", key, parts.size());
                software.amazon.awssdk.services.s3.model.CompletedMultipartUpload completed = software.amazon.awssdk.services.s3.model.CompletedMultipartUpload.builder().parts(parts).build();
                return s3Client.completeMultipartUpload(software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest.builder().bucket(config.awsBucket()).key(key).uploadId(uploadId).multipartUpload(completed).build()).eTag();
            } catch (InterruptedException interrupted) { 
                abort(uploadId, key); 
                Thread.currentThread().interrupt(); // Restaura flag de interrupção
                throw new IOException("Upload interrompido para " + key + ": " + interrupted.getMessage(), interrupted); 
            } catch (software.amazon.awssdk.core.exception.SdkException e) { 
                String errorMsg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                log.error("Erro SDK durante upload de {}: {}", key, errorMsg, e);
                abort(uploadId, key); 
                throw new IOException("Falha durante MPU de " + key + ": " + errorMsg, e); 
            } catch (IOException e) { 
                abort(uploadId, key); 
                throw e; 
            }
        }

        private void abort(String uploadId, String key) {
            if (uploadId == null || key == null) {
                log.debug("Skip abort: uploadId ou key nulo");
                return;
            }
            try {
                log.info("Abortando upload multipart {} para {}", uploadId, key);
                s3Client.abortMultipartUpload(software.amazon.awssdk.services.s3.model.AbortMultipartUploadRequest.builder()
                        .bucket(config.awsBucket())
                        .key(key)
                        .uploadId(uploadId)
                        .build());
                log.info("Upload multipart {} abortado com sucesso", uploadId);
            } catch (software.amazon.awssdk.core.exception.SdkException ex) { 
                String errorMsg = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
                log.warn("Falha ao abortar MPU {} para {}: {}", uploadId, key, errorMsg); 
            }
        }

        private java.util.Map<String, String> metadata(String checksum) { java.util.Map<String, String> metadata = new java.util.HashMap<>(); metadata.put("container-checksum", checksum); return metadata; }

        private void applyEncryption(software.amazon.awssdk.services.s3.model.PutObjectRequest.Builder builder) {
            String algorithm = config.sseAlgorithm(); if (algorithm == null || algorithm.isBlank()) return;
            if ("AES256".equalsIgnoreCase(algorithm)) { builder.serverSideEncryption(software.amazon.awssdk.services.s3.model.ServerSideEncryption.AES256); }
            else if ("aws:kms".equalsIgnoreCase(algorithm) || "AWS_KMS".equalsIgnoreCase(algorithm)) { builder.serverSideEncryption(software.amazon.awssdk.services.s3.model.ServerSideEncryption.AWS_KMS); config.sseKmsKeyId().ifPresent(builder::ssekmsKeyId); }
        }

        private void applyEncryption(software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest.Builder builder) {
            String algorithm = config.sseAlgorithm(); if (algorithm == null || algorithm.isBlank()) return;
            if ("AES256".equalsIgnoreCase(algorithm)) { builder.serverSideEncryption(software.amazon.awssdk.services.s3.model.ServerSideEncryption.AES256); }
            else if ("aws:kms".equalsIgnoreCase(algorithm) || "AWS_KMS".equalsIgnoreCase(algorithm)) { builder.serverSideEncryption(software.amazon.awssdk.services.s3.model.ServerSideEncryption.AWS_KMS); config.sseKmsKeyId().ifPresent(builder::ssekmsKeyId); }
        }

        private void sleepQuietly(long millis) {
            try { Thread.sleep(millis); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
        }

        private String errorMessage(Throwable e) {
            String msg = e.getMessage();
            if (msg == null || msg.isBlank()) return e.getClass().getSimpleName();
            return msg;
        }

        private String key(String sessionId, java.util.UUID backupId) { return sessionId + "/" + backupId + "/container.tar.zst"; }

        public static software.amazon.awssdk.services.s3.S3Client createClient(AppConfig config) {
            software.amazon.awssdk.services.s3.S3ClientBuilder builder = software.amazon.awssdk.services.s3.S3Client.builder()
                    .region(software.amazon.awssdk.regions.Region.of(config.awsRegion()))
                    .credentialsProvider(credentialsProvider(config));
            config.awsEndpointOverride().ifPresent(endpoint -> builder.endpointOverride(java.net.URI.create(endpoint)));
            return builder.build();
        }

        public void updateClient(software.amazon.awssdk.services.s3.S3Client client) {
            Objects.requireNonNull(client, "client");
            software.amazon.awssdk.services.s3.S3Client previous = this.s3Client;
            this.s3Client = client;
            if (previous != null && previous != client) { try { previous.close(); } catch (Exception ignore) {} }
        }

        private static software.amazon.awssdk.auth.credentials.AwsCredentialsProvider credentialsProvider(AppConfig config) {
            return config.awsAccessKeyId().flatMap(accessKey -> config.awsSecretAccessKey().map(secretKey -> newCredentialsProvider(accessKey, secretKey, config.awsSessionToken().orElse(null)))).orElseGet(software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider::create);
        }

        private static software.amazon.awssdk.auth.credentials.AwsCredentialsProvider newCredentialsProvider(String accessKey, String secretKey, String sessionToken) {
            software.amazon.awssdk.auth.credentials.AwsCredentials credentials;
            if (sessionToken != null && !sessionToken.isBlank()) { credentials = software.amazon.awssdk.auth.credentials.AwsSessionCredentials.create(accessKey, secretKey, sessionToken); }
            else { credentials = software.amazon.awssdk.auth.credentials.AwsBasicCredentials.create(accessKey, secretKey); }
            return software.amazon.awssdk.auth.credentials.StaticCredentialsProvider.create(credentials);
        }

        @Override public void close() { s3Client.close(); }
    }

    // ---- Local Uploader --------------------------------------------------

    public static final class LocalUploader implements Uploader {
        private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(LocalUploader.class);
        private final LocalBackupLocation location;
        public LocalUploader(LocalBackupLocation location) { this.location = Objects.requireNonNull(location, "location"); }
        @Override
        public UploadResult upload(java.nio.file.Path container, long size, String sessionId, java.util.UUID backupId, String checksum) throws IOException {
            Objects.requireNonNull(container, "container"); Objects.requireNonNull(sessionId, "sessionId"); Objects.requireNonNull(backupId, "backupId"); Objects.requireNonNull(checksum, "checksum");
            String key = sessionId + "/" + backupId + "/container.tar.zst";
            java.nio.file.Path dest = location.current().resolve(key);
            java.nio.file.Files.createDirectories(dest.getParent());
            if (java.nio.file.Files.exists(dest)) { log.info("Objeto local {} já existe - reutilizando", dest); return new UploadResult("local", key, checksum, size, true); }
            try { java.nio.file.Files.move(container, dest, java.nio.file.StandardCopyOption.ATOMIC_MOVE); }
            catch (IOException moveEx) { log.debug("MOVE falhou ({}), tentando copiar...", moveEx.toString()); java.nio.file.Files.copy(container, dest, new java.nio.file.CopyOption[]{java.nio.file.StandardCopyOption.REPLACE_EXISTING}); try { java.nio.file.Files.deleteIfExists(container); } catch (IOException ignore) { } }
            return new UploadResult("local", key, checksum, java.nio.file.Files.size(dest), false);
        }
    }

    /** Resultado do envio para o backend. */
    public static final class UploadResult {
        private final String bucket;
        private final String key;
        private final String etag;
        private final long size;
        private final boolean reused;

        public UploadResult(String bucket, String key, String etag, long size, boolean reused) {
            this.bucket = Objects.requireNonNull(bucket, "bucket");
            this.key = Objects.requireNonNull(key, "key");
            this.etag = etag;
            this.size = size;
            this.reused = reused;
        }

        public String bucket() { return bucket; }
        public String key() { return key; }
        public String etag() { return etag; }
        public long size() { return size; }
        public boolean reused() { return reused; }
    }

    /** Abstração para envio do container empacotado para um backend de storage. */
    public interface Uploader extends AutoCloseable {

        UploadResult upload(java.nio.file.Path container,
                            long size,
                            String sessionId,
                            java.util.UUID backupId,
                            String checksum) throws IOException;

        @Override
        default void close() throws Exception { }
    }

    public enum StorageBackend {
        CLOUD("s3"),
        LOCAL("local"),
        AZURE("azure"),
        GCS("gcs");

        private final String prefix;

        StorageBackend(String prefix) { this.prefix = prefix; }

        public String prefix() { return prefix; }

        public String qualify(String key) { return prefix + ":" + key; }

        public static StorageBackend fromQualifiedKey(String key) {
            if (key.startsWith("local:")) return LOCAL;
            if (key.startsWith("s3:")) return CLOUD;
            return CLOUD;
        }

        public static String stripQualifier(String key) {
            if (key.startsWith("local:")) return key.substring("local:".length());
            if (key.startsWith("s3:")) return key.substring("s3:".length());
            return key;
        }
    }
}
