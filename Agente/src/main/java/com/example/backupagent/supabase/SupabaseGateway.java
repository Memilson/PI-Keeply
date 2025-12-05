package com.example.backupagent.supabase;

import com.example.backupagent.backup.Backup.ChunkIndexRecord;
import com.example.backupagent.backup.Backup.ManifestFile;
import com.example.backupagent.backup.Backup.ManifestRecord;
import com.example.backupagent.packager.PackagerModule;
import com.example.backupagent.config.AppConfig;
import com.example.backupagent.diff.DiffModule.BackupType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;
import okhttp3.Headers;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Cliente REST enxuto e robusto para o PostgREST do Supabase (tabelas
 * backup_jobs, snapshots, snapshot_files, snapshot_file_chunks e chunk_index). Inclui:
 * - timeouts sensatos no HTTP;
 * - retries exponenciais para 429/5xx;
 * - utilitários de paginação e aggregate;
 * - separação clara entre processo (jobs) e resultado (snapshots).
 */
public final class SupabaseGateway {
    // Unificação: modelos do Supabase dentro de SupabaseGateway
    public enum HistoryOperationType { FULL, INCREMENTAL;
        public static HistoryOperationType fromBackupType(com.example.backupagent.diff.DiffModule.BackupType type) {
            if (type == null) return INCREMENTAL;
            return switch (type) {
                case FULL -> FULL;
                case INCREMENTAL -> INCREMENTAL;
            };
        }
    }

    public enum HistoryStatus { 
        STARTED,    // Mapeia para RUNNING no banco
        RUNNING,    // Mapeia para RUNNING no banco
        SUCCESS,    // Mapeia para COMPLETED no banco
        ERROR,      // Mapeia para FAILED no banco
        PENDING,    // Mapeia para PENDING no banco
        FAILED,     // Mapeia para FAILED no banco
        COMPLETED,  // Valor do banco
        CANCELLED;  // Valor do banco
        
        public String toDbStatus() {
            return switch (this) {
                case STARTED, RUNNING -> "RUNNING";
                case SUCCESS, COMPLETED -> "COMPLETED";
                case ERROR, FAILED -> "FAILED";
                case PENDING -> "PENDING";
                case CANCELLED -> "CANCELLED";
            };
        }
        
        public static HistoryStatus fromDbStatus(String dbStatus) {
            if (dbStatus == null) return PENDING;
            return switch (dbStatus.toUpperCase(Locale.ROOT)) {
                case "RUNNING" -> RUNNING;
                case "COMPLETED" -> SUCCESS;
                case "FAILED" -> FAILED;
                case "CANCELLED" -> CANCELLED;
                default -> PENDING;
            };
        }
    }

    public static final class BackupRecord {
        private final java.util.UUID id;
        private final String userId;
        private final java.util.UUID manifestId;
        private final java.util.UUID parentManifestId;
        private final String root;
        private final String repoDir;
        private final String dataDir;
        private final String containerName;
        private final com.example.backupagent.diff.DiffModule.BackupType type;
        private final HistoryStatus status;
        private final Long filesTotal;
        private final Long bytesTotal;
        private final Long chunksNew;
        private final Long chunksReused;
        private final java.time.Instant startedAt;
        private final java.time.Instant finishedAt;
        private final String errorMessage;
        private final String storageContainerKey;
        private final java.util.UUID setId;
        private final java.util.UUID backupId;

        public BackupRecord(java.util.UUID id, String userId, java.util.UUID manifestId, java.util.UUID parentManifestId,
                            String root, String repoDir, String dataDir, String containerName,
                            com.example.backupagent.diff.DiffModule.BackupType type, HistoryStatus status,
                            Long filesTotal, Long bytesTotal, Long chunksNew, Long chunksReused,
                            java.time.Instant startedAt, java.time.Instant finishedAt, String errorMessage,
                            String storageContainerKey, java.util.UUID backupId, java.util.UUID setId) {
            this.id = id; this.userId = userId; this.manifestId = manifestId; this.parentManifestId = parentManifestId;
            this.root = root; this.repoDir = repoDir; this.dataDir = dataDir; this.containerName = containerName;
            this.type = type; this.status = status; this.filesTotal = filesTotal; this.bytesTotal = bytesTotal;
            this.chunksNew = chunksNew; this.chunksReused = chunksReused; this.startedAt = startedAt; this.finishedAt = finishedAt;
            this.errorMessage = errorMessage; this.storageContainerKey = storageContainerKey; this.backupId = backupId; this.setId = setId;
        }

        public java.util.UUID id() { return id; }
        public String userId() { return userId; }
        public java.util.UUID manifestId() { return manifestId; }
        public java.util.UUID parentManifestId() { return parentManifestId; }
        public String root() { return root; }
        public String repoDir() { return repoDir; }
        public String dataDir() { return dataDir; }
        public String containerName() { return containerName; }
        public com.example.backupagent.diff.DiffModule.BackupType type() { return type; }
        public HistoryStatus status() { return status; }
        public Long filesTotal() { return filesTotal; }
        public Long bytesTotal() { return bytesTotal; }
        public Long chunksNew() { return chunksNew; }
        public Long chunksReused() { return chunksReused; }
        public java.time.Instant startedAt() { return startedAt; }
        public java.time.Instant finishedAt() { return finishedAt; }
        public String errorMessage() { return errorMessage; }
        public String storageContainerKey() { return storageContainerKey; }
        public java.util.UUID setId() { return setId; }
        public java.util.UUID backupId() { return backupId; }
    }

    public static final class HistoryRecord {
        private final java.util.UUID id;
        private final String userId;
        private final java.util.UUID manifestId;
        private final java.util.UUID parentManifestId;
        private final String root;
        private final String repoDir;
        private final HistoryOperationType type;
        private final HistoryStatus status;
        private final long filesTotal;
        private final long bytesTotal;
        private final java.time.Instant startedAt;
        private final java.time.Instant finishedAt;
        private final String errorMessage;
        private final String containerKey;
        private final String backupId;
        private final java.util.UUID setId;

        private HistoryRecord(Builder b) {
            this.id = b.id; this.userId = b.userId; this.manifestId = b.manifestId; this.parentManifestId = b.parentManifestId;
            this.root = b.root; this.repoDir = b.repoDir; this.type = b.type; this.status = b.status;
            this.filesTotal = b.filesTotal; this.bytesTotal = b.bytesTotal; this.startedAt = b.startedAt; this.finishedAt = b.finishedAt;
            this.errorMessage = b.errorMessage; this.containerKey = b.containerKey; this.backupId = b.backupId; this.setId = b.setId;
        }

        public static Builder builder() { return new Builder(); }
        public Builder toBuilder() {
            return new Builder()
                .id(id)
                .userId(userId)
                .manifestId(manifestId)
                .parentManifestId(parentManifestId)
                .root(root)
                .repoDir(repoDir)
                .type(type)
                .status(status)
                .filesTotal(filesTotal)
                .bytesTotal(bytesTotal)
                .startedAt(startedAt)
                .finishedAt(finishedAt)
                .errorMessage(errorMessage)
                .containerKey(containerKey)
                .backupId(backupId)
                .setId(setId);
        }

        public static final class Builder {
            private java.util.UUID id;
            private String userId;
            private java.util.UUID manifestId;
            private java.util.UUID parentManifestId;
            private String root;
            private String repoDir;
            private HistoryOperationType type;
            private HistoryStatus status;
            private long filesTotal;
            private long bytesTotal;
            private java.time.Instant startedAt;
            private java.time.Instant finishedAt;
            private String errorMessage;
            private String containerKey;
            private String backupId;
            private java.util.UUID setId;

            public Builder id(java.util.UUID v){this.id=v;return this;}
            public Builder userId(String v){this.userId=v;return this;}
            public Builder manifestId(java.util.UUID v){this.manifestId=v;return this;}
            public Builder parentManifestId(java.util.UUID v){this.parentManifestId=v;return this;}
            public Builder root(String v){this.root=v;return this;}
            public Builder repoDir(String v){this.repoDir=v;return this;}
            public Builder type(HistoryOperationType v){this.type=v;return this;}
            public Builder status(HistoryStatus v){this.status=v;return this;}
            public Builder filesTotal(long v){this.filesTotal=v;return this;}
            public Builder bytesTotal(long v){this.bytesTotal=v;return this;}
            public Builder startedAt(java.time.Instant v){this.startedAt=v;return this;}
            public Builder finishedAt(java.time.Instant v){this.finishedAt=v;return this;}
            public Builder errorMessage(String v){this.errorMessage=v;return this;}
            public Builder containerKey(String v){this.containerKey=v;return this;}
            public Builder backupId(String v){this.backupId=v;return this;}
            public Builder setId(java.util.UUID v){this.setId=v;return this;}
            public HistoryRecord build(){return new HistoryRecord(this);}        }

        public java.util.UUID id(){return id;}
        public String userId(){return userId;}
        public java.util.UUID manifestId(){return manifestId;}
        public java.util.UUID parentManifestId(){return parentManifestId;}
        public String root(){return root;}
        public String repoDir(){return repoDir;}
        public HistoryOperationType type(){return type;}
        public HistoryStatus status(){return status;}
        public long filesTotal(){return filesTotal;}
        public long bytesTotal(){return bytesTotal;}
        public java.time.Instant startedAt(){return startedAt;}
        public java.time.Instant finishedAt(){return finishedAt;}
        public String errorMessage(){return errorMessage;}
        public String containerKey(){return containerKey;}
        public String backupId(){return backupId;}
        public java.util.UUID setId(){return setId;}
    }

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_INSTANT;

    private final AppConfig config;
    private final OkHttpClient httpClient;
    private final ObjectMapper mapper = new ObjectMapper();

    // ---- Construtores -----------------------------------------------------

    public SupabaseGateway(AppConfig config, OkHttpClient httpClient) {
        this.config = Objects.requireNonNull(config, "config");
        this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
    }

    public SupabaseGateway(AppConfig config) {
        this(config, defaultHttp());
    }

    private static OkHttpClient defaultHttp() {
        return new OkHttpClient.Builder()
                .connectTimeout(Duration.ofSeconds(30))
                .readTimeout(Duration.ofMinutes(5))  // 5 minutos para operações de batch grandes
                .writeTimeout(Duration.ofMinutes(5))
                .build();
    }

    // ---- HISTORY ----------------------------------------------------------

    /**
     * Cria um novo backup job (AUTENTICADO). Use o accessToken do usuário para respeitar RLS.
     */
    public UUID createBackupJob(String accessToken, BackupRecord record) throws IOException {
        Objects.requireNonNull(record, "record");
        ObjectNode payload = backupJobPayload(record);
        Request request = baseRequest(baseUrl("/backup_jobs"), accessToken)
                .header("Prefer", "return=representation")
                .addHeader("Prefer", "resolution=merge-duplicates")
                .post(RequestBody.create(payload.toString(), JSON))
                .build();
        JsonNode node = executeForJsonWithRetry(request);
        return extractId(node, "backup_jobs");
    }

    /**
     * Compat: versão antiga SEM token (útil com service_role em backend). Prefira a versão com token.
     */
    @Deprecated
    public UUID insertHistoryBackup(BackupRecord record) throws IOException {
        return createBackupJob(null, record);
    }

    /**
     * Atualiza o status de um backup job
     */
    public void updateBackupJobStatus(String accessToken, UUID jobId, HistoryStatus status, String errorMessage) throws IOException {
        ObjectNode payload = mapper.createObjectNode();
        payload.put("status", status.toDbStatus());
        if (errorMessage != null) {
            payload.put("error_message", errorMessage);
        }
        if (status == HistoryStatus.SUCCESS || status == HistoryStatus.FAILED || status == HistoryStatus.ERROR) {
            payload.put("finished_at", ISO.format(Instant.now()));
        }
        
        HttpUrl url = baseUrl("/backup_jobs").newBuilder()
                .addQueryParameter("id", "eq." + jobId)
                .build();
        Request request = baseRequest(url, accessToken)
                .patch(RequestBody.create(payload.toString(), JSON))
                .build();
        executeVoidWithRetry(request);
    }

    public HistoryRecord insertHistory(String accessToken, HistoryRecord record) throws IOException {
        ObjectNode payload = historyToJson(record);
        Request request = baseRequest(baseUrl("/backup_jobs"), accessToken)
                .header("Prefer", "return=representation")
                .post(RequestBody.create(payload.toString(), JSON))
                .build();
        JsonNode node = executeForJsonWithRetry(request);
        if (node == null || !node.isArray() || node.isEmpty()) {
            throw new IOException("Supabase não retornou history inserido");
        }
        return parseHistory(node.get(0));
    }

    public HistoryRecord updateHistory(String accessToken, HistoryRecord record) throws IOException {
        if (record.id() == null) throw new IllegalArgumentException("Registro de histórico sem id");
        ObjectNode payload = historyToJson(record);
        HttpUrl url = baseUrl("/backup_jobs").newBuilder()
                .addQueryParameter("id", "eq." + record.id())
                .build();
        Request request = baseRequest(url, accessToken)
                .header("Prefer", "return=representation")
                .patch(RequestBody.create(payload.toString(), JSON))
                .build();
        JsonNode node = executeForJsonWithRetry(request);
        if (node == null || !node.isArray() || node.isEmpty()) {
            throw new IOException("Supabase não retornou history atualizado");
        }
        return parseHistory(node.get(0));
    }

    public List<HistoryRecord> historyForSet(String accessToken, String userId, UUID setId) throws IOException {
        HttpUrl.Builder builder = baseUrl("/backup_jobs").newBuilder()
                .addQueryParameter("user_id", "eq." + userId)
                .addQueryParameter("order", "started_at.desc");
        if (setId != null) builder.addQueryParameter("set_id", "eq." + setId);
        Request request = baseRequest(builder.build(), accessToken).get().build();
        JsonNode node = executeForJsonWithRetry(request);
        List<HistoryRecord> history = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode element : node) history.add(parseHistory(element));
        }
        return history;
    }

    /** Soma de bytes_total (status=SUCCESS) */
    public long totalBytesFromHistory(String accessToken, String userId, UUID setId) throws IOException {
        HttpUrl.Builder builder = baseUrl("/backup_jobs").newBuilder()
                .addQueryParameter("user_id", "eq." + userId)
                .addQueryParameter("status", "eq." + HistoryStatus.SUCCESS.name())
                .addQueryParameter("select", "bytes_total");
        if (setId != null) builder.addQueryParameter("set_id", "eq." + setId);
        Request request = baseRequest(builder.build(), accessToken).get().build();
        JsonNode node = executeForJsonWithRetry(request);
        if (node == null || !node.isArray() || node.isEmpty()) return 0L;
        long sum = 0L;
        for (JsonNode entry : node) {
            if (entry != null && entry.has("bytes_total") && !entry.get("bytes_total").isNull()) {
                sum += entry.get("bytes_total").asLong(0L);
            }
        }
        return sum;
    }

    // ---- MANIFESTS --------------------------------------------------------

    public Optional<ManifestRecord> latestManifest(String accessToken, String userId, String root) throws IOException {
        HttpUrl url = baseUrl("/snapshots").newBuilder()
                .addQueryParameter("user_id", "eq." + userId)
                .addQueryParameter("root_path", "eq." + root)
                .addQueryParameter("order", "created_at.desc")
                .addQueryParameter("limit", "1")
                .build();
        Request request = baseRequest(url, accessToken).get().build();
        JsonNode node = executeForJsonWithRetry(request);
        if (node == null || !node.isArray() || node.isEmpty()) return Optional.empty();
        ManifestRecord base = parseSnapshot(node.get(0));
        return Optional.of(attachFiles(accessToken, base));
    }

    public Optional<ManifestRecord> manifestById(String accessToken, UUID id) throws IOException {
        HttpUrl url = baseUrl("/snapshots").newBuilder()
                .addQueryParameter("id", "eq." + id)
                .addQueryParameter("limit", "1")
                .build();
        Request request = baseRequest(url, accessToken).get().build();
        JsonNode node = executeForJsonWithRetry(request);
        if (node == null || !node.isArray() || node.isEmpty()) return Optional.empty();
        ManifestRecord base = parseSnapshot(node.get(0));
        return Optional.of(attachFiles(accessToken, base));
    }

    public List<ManifestRecord> manifestsForRootUpTo(String accessToken, String userId, String root, Instant upTo) throws IOException {
        HttpUrl.Builder builder = baseUrl("/snapshots").newBuilder()
                .addQueryParameter("user_id", "eq." + userId)
                .addQueryParameter("root_path", "eq." + root)
                .addQueryParameter("order", "created_at.asc");
        if (upTo != null) builder.addQueryParameter("created_at", "lte." + ISO.format(upTo));
        Request request = baseRequest(builder.build(), accessToken).get().build();
        JsonNode node = executeForJsonWithRetry(request);
        List<ManifestRecord> manifests = new ArrayList<>();
        if (node != null && node.isArray()) for (JsonNode el : node) manifests.add(attachFiles(accessToken, parseSnapshot(el)));
        return manifests;
    }

    public List<ManifestRecord> manifestsForSet(String accessToken, String userId, UUID setId) throws IOException {
        HttpUrl.Builder builder = baseUrl("/snapshots").newBuilder()
                .addQueryParameter("user_id", "eq." + userId)
                .addQueryParameter("order", "created_at.desc");
        if (setId != null) builder.addQueryParameter("set_id", "eq." + setId);
        Request request = baseRequest(builder.build(), accessToken).get().build();
        JsonNode node = executeForJsonWithRetry(request);
        List<ManifestRecord> manifests = new ArrayList<>();
        if (node != null && node.isArray()) for (JsonNode el : node) manifests.add(attachFiles(accessToken, parseSnapshot(el)));
        return manifests;
    }

    public ManifestRecord insertManifest(String accessToken, ManifestRecord record,
                                         Map<String, List<com.example.backupagent.packager.KbcFormat.ChunkEntry>> chunkMap) throws IOException {
        ManifestRecord stored = insertManifestRow(accessToken, record);

        if (record.files() != null && !record.files().isEmpty()) {
            Map<String, UUID> fileIds = insertManifestFiles(accessToken, stored, record.files());
            insertFileChunks(accessToken, fileIds, record.files(), chunkMap);
            return copyWithFiles(stored, record.files());
        }
        return stored;
    }

    private ManifestRecord insertManifestRow(String accessToken, ManifestRecord record) throws IOException {
        ObjectNode payload = snapshotToJson(record);
        Request request = baseRequest(baseUrl("/snapshots"), accessToken)
                .header("Prefer", "return=representation")
                .post(RequestBody.create(payload.toString(), JSON))
                .build();
        JsonNode node = executeForJsonWithRetry(request);
        if (node == null || !node.isArray() || node.isEmpty()) throw new IOException("Supabase não retornou snapshot inserido");
        return parseSnapshot(node.get(0));
    }

    // ---- CHUNK INDEX ------------------------------------------------------

    public Map<String, ChunkIndexRecord> chunkIndexByHashes(String accessToken, String userId, UUID setId, Set<String> hashes) throws IOException {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(setId, "setId");
        Map<String, ChunkIndexRecord> result = new HashMap<>();

        if (hashes == null || hashes.isEmpty()) return result;

        // 1) Buscar snapshot_file_chunks pelos hashes solicitados
        record ChunkRow(UUID snapshotFileId, String hash, long offset, long length) {}
        List<String> all = new ArrayList<>(new HashSet<>(hashes));
        final int batchSize = 40;
        List<ChunkRow> chunkRows = new ArrayList<>();
        for (int i = 0; i < all.size(); i += batchSize) {
            List<String> batch = all.subList(i, Math.min(all.size(), i + batchSize));
            String inClause = batch.stream().map(h -> "\"" + h + "\"").collect(Collectors.joining(","));
            HttpUrl url = baseUrl("/snapshot_file_chunks").newBuilder()
                    .addQueryParameter("chunk_hash", "in.(" + inClause + ")")
                    .addQueryParameter("select", "snapshot_file_id,chunk_hash,chunk_offset,chunk_length")
                    .build();
            Request request = baseRequest(url, accessToken).get().build();
            JsonNode node = executeForJsonWithRetry(request);
            if (node != null && node.isArray()) {
                for (JsonNode element : node) {
                    if (!element.hasNonNull("snapshot_file_id")) continue;
                    UUID sfId = UUID.fromString(element.get("snapshot_file_id").asText());
                    String hash = element.path("chunk_hash").asText(null);
                    long offset = element.hasNonNull("chunk_offset") ? element.get("chunk_offset").asLong() : 0L;
                    long length = element.hasNonNull("chunk_length") ? element.get("chunk_length").asLong() : 0L;
                    if (hash != null) {
                        chunkRows.add(new ChunkRow(sfId, hash, offset, length));
                    }
                }
            }
        }

        if (chunkRows.isEmpty()) return result;

        // 2) Mapear snapshot_file_id -> snapshot_id (filtrado por user_id)
        Set<UUID> snapshotFileIds = chunkRows.stream().map(ChunkRow::snapshotFileId).collect(Collectors.toSet());
        Map<UUID, UUID> fileToSnapshot = new HashMap<>();
        List<UUID> fileList = new ArrayList<>(snapshotFileIds);
        final int fileBatch = 100;
        for (int i = 0; i < fileList.size(); i += fileBatch) {
            List<UUID> batch = fileList.subList(i, Math.min(fileList.size(), i + fileBatch));
            String inClause = batch.stream().map(UUID::toString).map(id -> "\"" + id + "\"").collect(Collectors.joining(","));
            HttpUrl url = baseUrl("/snapshot_files").newBuilder()
                    .addQueryParameter("id", "in.(" + inClause + ")")
                    .addQueryParameter("user_id", "eq." + userId)
                    .addQueryParameter("select", "id,snapshot_id")
                    .build();
            Request request = baseRequest(url, accessToken).get().build();
            JsonNode node = executeForJsonWithRetry(request);
            if (node != null && node.isArray()) {
                for (JsonNode element : node) {
                    UUID id = UUID.fromString(element.get("id").asText());
                    UUID snapshotId = UUID.fromString(element.get("snapshot_id").asText());
                    fileToSnapshot.put(id, snapshotId);
                }
            }
        }

        if (fileToSnapshot.isEmpty()) return result;

        // 3) Mapear snapshot_id -> container_key (filtrado por set_id)
        Set<UUID> snapshotIds = new HashSet<>(fileToSnapshot.values());
        Map<UUID, String> snapshotToContainer = new HashMap<>();
        List<UUID> snapList = new ArrayList<>(snapshotIds);
        final int snapBatch = 100;
        for (int i = 0; i < snapList.size(); i += snapBatch) {
            List<UUID> batch = snapList.subList(i, Math.min(snapList.size(), i + snapBatch));
            String inClause = batch.stream().map(UUID::toString).map(id -> "\"" + id + "\"").collect(Collectors.joining(","));
            HttpUrl url = baseUrl("/snapshots").newBuilder()
                    .addQueryParameter("id", "in.(" + inClause + ")")
                    .addQueryParameter("set_id", "eq." + setId)
                    .addQueryParameter("select", "id,container_key,set_id")
                    .build();
            Request request = baseRequest(url, accessToken).get().build();
            JsonNode node = executeForJsonWithRetry(request);
            if (node != null && node.isArray()) {
                for (JsonNode element : node) {
                    UUID id = UUID.fromString(element.get("id").asText());
                    String containerKey = element.get("container_key").asText();
                    snapshotToContainer.put(id, containerKey);
                }
            }
        }

        // 4) Montar ?ndice hash -> localiza??o
        Instant now = Instant.now();
        for (ChunkRow row : chunkRows) {
            UUID snapshotId = fileToSnapshot.get(row.snapshotFileId());
            if (snapshotId == null) continue;
            String containerKey = snapshotToContainer.get(snapshotId);
            if (containerKey == null) continue;

            long length = Math.max(row.length(), 0L);
            long offset = Math.max(row.offset(), 0L);

            ChunkIndexRecord rec = ChunkIndexRecord.builder()
                    .userId(userId)
                    .setId(setId)
                    .hash(row.hash())
                    .containerKey(containerKey)
                    .offset(offset)
                    .originalSize(length)
                    .compressedSize(length)
                    .firstManifestId(snapshotId)
                    .lastManifestId(snapshotId)
                    .lastSeenAt(now)
                    .build();
            result.put(row.hash(), rec);
        }

        return result;
    }

    public void upsertChunkIndex(String accessToken, List<ChunkIndexRecord> chunks) throws IOException {
        // TODO: Implementar com novo schema ou remover se deduplicação global não for necessária
        // Temporariamente desabilitado - chunk_index não existe
        if (chunks == null || chunks.isEmpty()) return;
        // NOOP - chunk_index desabilitado
        /* DESABILITADO
        ArrayNode array = mapper.createArrayNode();
        for (ChunkIndexRecord ch : chunks) {
            ObjectNode node = mapper.createObjectNode();
            node.put("user_id", ch.userId());
            node.put("set_id", ch.setId().toString());
            node.put("hash_sha256", ch.hash());
            node.put("container_key", ch.containerKey());
            node.put("chunk_offset", ch.offset());
            node.put("original_size", ch.originalSize());
            node.put("compressed_size", ch.compressedSize());
            node.put("first_manifest_id", ch.firstManifestId().toString());
            node.put("last_manifest_id", ch.lastManifestId().toString());
            node.put("last_seen_at", ISO.format(ch.lastSeenAt()));
            array.add(node);
        }
        Request request = baseRequest(baseUrl("/chunk_index"), accessToken)
                .header("Prefer", "resolution=merge-duplicates")
                .post(RequestBody.create(array.toString(), JSON))
                .build();
        executeVoidWithRetry(request);
        */
    }

    public void upsertChunkIndexParallel(String accessToken, List<ChunkIndexRecord> chunks) throws IOException {
        upsertChunkIndexParallel(accessToken, chunks, Math.max(2, Math.min(Runtime.getRuntime().availableProcessors(), 8)), 200);
    }

    public void upsertChunkIndexParallel(String accessToken, List<ChunkIndexRecord> chunks, int parallelism, int batchSize) throws IOException {
        if (chunks == null || chunks.isEmpty()) return;
        List<ChunkIndexRecord> list = Collections.unmodifiableList(new ArrayList<>(chunks));
        ExecutorService pool = Executors.newFixedThreadPool(parallelism);
        List<Callable<Void>> tasks = new ArrayList<>();
        for (int i = 0; i < list.size(); i += batchSize) {
            int from = i;
            int to = Math.min(list.size(), i + batchSize);
            List<ChunkIndexRecord> slice = list.subList(from, to);
            tasks.add(() -> { upsertChunkIndex(accessToken, slice); return null; });
        }
        try {
            List<Future<Void>> futures = pool.invokeAll(tasks);
            for (Future<Void> f : futures) {
                try { f.get(); }
                catch (ExecutionException e) {
                    Throwable cause = e.getCause();
                    if (cause instanceof IOException io) throw io;
                    throw new IOException(cause);
                }
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IOException("Paralelismo interrompido", ie);
        } finally {
            pool.shutdownNow();
        }
    }

    // ---- Manifest files / file_chunks normalizados -----------------------

    private Map<String, UUID> insertManifestFiles(String accessToken, ManifestRecord manifest, List<ManifestFile> files) throws IOException {
        if (files == null || files.isEmpty()) return Collections.emptyMap();

        // Enviar em lotes de 500 arquivos para evitar timeout
        final int BATCH_SIZE = 500;
        Map<String, UUID> allFileIds = new HashMap<>();
        
        System.out.println("[SNAPSHOT] Inserindo " + files.size() + " snapshot_files em lotes de " + BATCH_SIZE);
        
        for (int i = 0; i < files.size(); i += BATCH_SIZE) {
            int end = Math.min(i + BATCH_SIZE, files.size());
            List<ManifestFile> batch = files.subList(i, end);
            
            int batchNum = (i / BATCH_SIZE) + 1;
            int totalBatches = (files.size() + BATCH_SIZE - 1) / BATCH_SIZE;
            System.out.println("[SNAPSHOT] Enviando lote " + batchNum + "/" + totalBatches + ": " + batch.size() + " arquivos");
            
            ArrayNode payload = mapper.createArrayNode();
            for (ManifestFile file : batch) {
                ObjectNode node = mapper.createObjectNode();
                node.put("snapshot_id", manifest.id().toString());
                node.put("user_id", manifest.userId());
                node.put("path", file.path());
                node.put("size", file.size());
                node.put("modified_at", ISO.format(file.modifiedAt()));
                file.hash().ifPresent(h -> node.put("hash_sha256", h));
                node.put("is_deleted", file.isDeleted());
                payload.add(node);
            }

            Request request = baseRequest(baseUrl("/snapshot_files"), accessToken)
                    .header("Prefer", "return=representation")
                    .post(RequestBody.create(payload.toString(), JSON))
                    .build();
            JsonNode node = executeForJsonWithRetry(request);
            if (node == null || !node.isArray()) {
                throw new IOException("Supabase não retornou snapshot_files inseridos para lote " + batchNum);
            }
            
            for (JsonNode element : node) {
                String path = element.get("path").asText();
                UUID id = UUID.fromString(element.get("id").asText());
                allFileIds.put(path, id);
            }
        }
        
        System.out.println("[SNAPSHOT] Total de " + allFileIds.size() + " snapshot_files inseridos com sucesso");
        return allFileIds;
    }

    private void insertFileChunks(String accessToken, Map<String, UUID> fileIds, List<ManifestFile> files,
                                  Map<String, List<com.example.backupagent.packager.KbcFormat.ChunkEntry>> chunkMap) throws IOException {
        if (fileIds.isEmpty()) return;
        
        // Primeiro, contar quantos chunks totais teremos
        int totalChunks = 0;
        for (ManifestFile file : files) {
            if (fileIds.containsKey(file.path())) {
                totalChunks += file.chunkHashes().size();
            }
        }
        
        if (totalChunks == 0) return;
        
        System.out.println("[CHUNKS] Inserindo " + totalChunks + " file_chunks");
        
        // Enviar em lotes de 1000 chunks para evitar timeout
        final int BATCH_SIZE = 1000;
        ArrayNode payload = mapper.createArrayNode();
        int chunkCount = 0;
        int batchNum = 1;
        
        for (ManifestFile file : files) {
            UUID fileId = fileIds.get(file.path());
            if (fileId == null) continue;
            List<String> chunks = file.chunkHashes();
            List<com.example.backupagent.packager.KbcFormat.ChunkEntry> infos = (chunkMap != null) ? chunkMap.get(file.path()) : null;
            for (int i = 0; i < chunks.size(); i++) {
                long offset = 0L;
                long length = 0L;
                if (infos != null && i < infos.size()) {
                    com.example.backupagent.packager.KbcFormat.ChunkEntry info = infos.get(i);
                    offset = info.offset();
                    length = info.originalSize();
                }
                ObjectNode node = mapper.createObjectNode();
                node.put("snapshot_file_id", fileId.toString());
                node.put("seq", i);
                node.put("chunk_hash", chunks.get(i));
                node.put("chunk_offset", offset);
                node.put("chunk_length", length);
                payload.add(node);
                chunkCount++;
                
                // Enviar lote quando atingir o tamanho do batch
                if (payload.size() >= BATCH_SIZE) {
                    System.out.println("[CHUNKS] Enviando lote " + batchNum + ": " + payload.size() + " chunks");
                    Request request = baseRequest(baseUrl("/snapshot_file_chunks"), accessToken)
                            .header("Prefer", "resolution=merge-duplicates")
                            .post(RequestBody.create(payload.toString(), JSON))
                            .build();
                    executeVoidWithRetry(request);
                    payload = mapper.createArrayNode();
                    batchNum++;
                }
            }
        }
        
        // Enviar o último lote se houver chunks restantes
        if (payload.size() > 0) {
            System.out.println("[CHUNKS] Enviando lote final " + batchNum + ": " + payload.size() + " chunks");
            Request request = baseRequest(baseUrl("/snapshot_file_chunks"), accessToken)
                    .header("Prefer", "resolution=merge-duplicates")
                    .post(RequestBody.create(payload.toString(), JSON))
                    .build();
            executeVoidWithRetry(request);
        }
        
        System.out.println("[CHUNKS] Total de " + chunkCount + " file_chunks inseridos com sucesso");
    }

    private ManifestRecord attachFiles(String accessToken, ManifestRecord manifest) throws IOException {
        List<ManifestFile> files = fetchManifestFiles(accessToken, manifest);
        if (files.isEmpty()) {
            // fallback para compatibilidade com colunas antigas (JSONB em manifests.files)
            if (manifest.files() != null && !manifest.files().isEmpty()) {
                return manifest;
            }
            return copyWithFiles(manifest, Collections.emptyList());
        }
        return copyWithFiles(manifest, files);
    }

    private List<ManifestFile> fetchManifestFiles(String accessToken, ManifestRecord manifest) throws IOException {
        HttpUrl url = baseUrl("/snapshot_files").newBuilder()
                .addQueryParameter("snapshot_id", "eq." + manifest.id())
                .addQueryParameter("user_id", "eq." + manifest.userId())
                .addQueryParameter("order", "path.asc")
                .build();

        Request request = baseRequest(url, accessToken).get().build();
        JsonNode node = executeForJsonWithRetry(request);
        if (node == null || !node.isArray() || node.isEmpty()) return Collections.emptyList();

        Map<UUID, ManifestFile> baseFiles = new HashMap<>();
        List<UUID> ids = new ArrayList<>();
        for (JsonNode element : node) {
            UUID id = UUID.fromString(element.get("id").asText());
            ids.add(id);
            baseFiles.put(id, parseManifestFile(element));
        }

        Map<UUID, List<String>> chunks = fetchFileChunks(accessToken, ids);
        List<ManifestFile> result = new ArrayList<>();
        for (Map.Entry<UUID, ManifestFile> entry : baseFiles.entrySet()) {
            UUID fileId = entry.getKey();
            ManifestFile base = entry.getValue();
            List<String> hashes = chunks.getOrDefault(fileId, Collections.emptyList());
            result.add(new ManifestFile(base.path(), base.size(), base.modifiedAt(), base.hash().orElse(null), hashes, base.isDeleted()));
        }
        return result;
    }

    private Map<UUID, List<String>> fetchFileChunks(String accessToken, List<UUID> fileIds) throws IOException {
        Map<UUID, List<String>> map = new HashMap<>();
        if (fileIds == null || fileIds.isEmpty()) return map;

        // Dividir em lotes de 100 IDs para evitar URLs muito longas (limite ~2000 caracteres)
        final int BATCH_SIZE = 100;
        System.out.println("[CHUNKS FETCH] Buscando chunks para " + fileIds.size() + " arquivos");
        
        for (int i = 0; i < fileIds.size(); i += BATCH_SIZE) {
            int end = Math.min(i + BATCH_SIZE, fileIds.size());
            List<UUID> batch = fileIds.subList(i, end);
            
            String inClause = batch.stream()
                    .map(UUID::toString)
                    .map(id -> "\"" + id + "\"")
                    .collect(Collectors.joining(","));
            
            HttpUrl url = baseUrl("/snapshot_file_chunks").newBuilder()
                    .addQueryParameter("snapshot_file_id", "in.(" + inClause + ")")
                    .addQueryParameter("order", "seq.asc")
                    .build();
            
            Request request = baseRequest(url, accessToken).get().build();
            JsonNode node = executeForJsonWithRetry(request);
            
            if (node != null && node.isArray()) {
                for (JsonNode element : node) {
                    UUID mfId = UUID.fromString(element.get("snapshot_file_id").asText());
                    String hash = element.get("chunk_hash").asText();
                    map.computeIfAbsent(mfId, k -> new ArrayList<>()).add(hash);
                }
            }
        }
        
        System.out.println("[CHUNKS FETCH] Total de " + map.size() + " arquivos com chunks carregados");
        return map;
    }

    private ManifestRecord copyWithFiles(ManifestRecord base, List<ManifestFile> files) {
        return ManifestRecord.builder()
                .id(base.id())
                .userId(base.userId())
                .setId(base.setId())
                .type(base.type())
                .containerKey(base.containerKey())
                .containerSize(base.containerSize())
                .containerChecksum(base.containerChecksum())
                .containerName(base.containerName())
                .parentManifestId(base.parentManifestId())
                .timestamp(base.timestamp())
                .root(base.root())
                .repoDir(base.repoDir())
                .backupId(base.backupId())
                .storageBackend(base.storageBackend())
                .files(files)
                .build();
    }

    // ---- SERIALIZAÇÃO -----------------------------------------------------

    private ObjectNode snapshotToJson(ManifestRecord record) {
        ObjectNode node = mapper.createObjectNode();
        node.put("id", record.id().toString());
        node.put("user_id", record.userId());
        if (record.parentManifestId() != null) node.put("parent_snapshot_id", record.parentManifestId().toString());
        node.put("root_path", record.root());
        node.put("type", record.type().name());
        node.put("created_at", ISO.format(record.timestamp()));
        node.put("container_key", record.containerKey());
        if (record.containerName() != null) node.put("container_name", record.containerName());
        if (record.storageBackend() != null) node.put("storage_backend", record.storageBackend());
        node.put("job_id", record.backupId());
        node.put("container_size", record.containerSize());
        if (record.containerChecksum() != null) node.put("container_checksum", record.containerChecksum());
        if (record.setId() != null) node.put("set_id", record.setId().toString());
        // Campos estatísticos serão preenchidos automaticamente pelo trigger ou pela aplicação
        node.put("files_total", 0);
        node.put("bytes_total", 0L);
        return node;
    }

    private ObjectNode backupJobPayload(BackupRecord record) {
        ObjectNode node = mapper.createObjectNode();
        if (record.id() != null) node.put("id", record.id().toString());
        node.put("user_id", record.userId());
        node.put("root_path", record.root());
        node.put("type", record.type().name());
        node.put("status", record.status().toDbStatus());
        if (record.filesTotal() != null) node.put("files_scanned", record.filesTotal());
        if (record.bytesTotal() != null) node.put("bytes_total", record.bytesTotal());
        if (record.chunksNew() != null) node.put("chunks_new", record.chunksNew());
        if (record.chunksReused() != null) node.put("chunks_reused", record.chunksReused());
        node.put("started_at", ISO.format(record.startedAt()));
        if (record.finishedAt() != null) node.put("finished_at", ISO.format(record.finishedAt()));
        if (record.errorMessage() != null) node.put("error_message", record.errorMessage());
        if (record.setId() != null) node.put("set_id", record.setId().toString());
        return node;
    }

    private ObjectNode historyToJson(HistoryRecord record) {
        ObjectNode node = mapper.createObjectNode();
        if (record.id() != null) node.put("id", record.id().toString());
        node.put("user_id", record.userId());
        node.put("root_path", record.root());
        node.put("type", record.type().name());
        node.put("status", record.status().toDbStatus());
        node.put("files_scanned", record.filesTotal());
        node.put("bytes_total", record.bytesTotal());
        node.put("started_at", ISO.format(record.startedAt()));
        if (record.finishedAt() != null) node.put("finished_at", ISO.format(record.finishedAt()));
        if (record.errorMessage() != null) node.put("error_message", record.errorMessage());
        if (record.setId() != null) node.put("set_id", record.setId().toString());
        return node;
    }

    private ManifestRecord parseSnapshot(JsonNode node) throws IOException {
        UUID id = UUID.fromString(node.get("id").asText());
        String userId = node.get("user_id").asText();
        UUID parent = node.hasNonNull("parent_snapshot_id") ? UUID.fromString(node.get("parent_snapshot_id").asText()) : null;
        String root = node.get("root_path").asText();
        String type = node.get("type").asText();
        BackupType backupType = parseBackupType(type);
        Instant timestamp = Instant.parse(node.get("created_at").asText());
        String containerKey = node.get("container_key").asText();
        String containerName = node.hasNonNull("container_name") ? node.get("container_name").asText() : null;
        String storageBackend = node.hasNonNull("storage_backend") ? node.get("storage_backend").asText() : null;
        String jobId = node.hasNonNull("job_id") ? node.get("job_id").asText() : id.toString();
        long size = node.hasNonNull("container_size") ? node.get("container_size").asLong() : 0L;
        String checksum = node.hasNonNull("container_checksum") ? node.get("container_checksum").asText() : null;
        UUID setId = node.hasNonNull("set_id") ? UUID.fromString(node.get("set_id").asText()) : null;

        return ManifestRecord.builder()
                .id(id)
                .userId(userId)
                .parentManifestId(parent)
                .root(root)
                .repoDir(root)
                .type(backupType)
                .timestamp(timestamp)
                .containerKey(containerKey)
                .backupId(jobId)
                .containerSize(size)
                .containerChecksum(checksum)
                .containerName(containerName)
                .storageBackend(storageBackend)
                .files(new ArrayList<>())
                .setId(setId)
                .build();
    }

    private ManifestRecord parseManifest(JsonNode node) throws IOException {
        UUID id = UUID.fromString(node.get("id").asText());
        String userId = node.get("user_id").asText();
        UUID parent = node.hasNonNull("parent_manifest_id") ? UUID.fromString(node.get("parent_manifest_id").asText()) : null;
        String root = node.get("root").asText();
        String repoDir = node.hasNonNull("repo_dir") ? node.get("repo_dir").asText() : root;
        String type = node.get("type").asText();
        BackupType backupType = parseBackupType(type);
        Instant timestamp = Instant.parse(node.get("timestamp").asText());
        String containerKey = node.get("container_key").asText();
        String containerName = node.hasNonNull("container_name") ? node.get("container_name").asText() : null;
        String storageBackend = node.hasNonNull("storage_backend") ? node.get("storage_backend").asText() : null;
        String backupId = node.hasNonNull("backup_id") ? node.get("backup_id").asText() : id.toString();
        long size = node.hasNonNull("container_size") ? node.get("container_size").asLong() : 0L;
        String checksum = node.hasNonNull("container_checksum") ? node.get("container_checksum").asText() : null;
        UUID setId = node.hasNonNull("set_id") ? UUID.fromString(node.get("set_id").asText()) : null;

        List<ManifestFile> files = new ArrayList<>();
        JsonNode filesNode = node.get("files");
        if (filesNode != null && filesNode.isArray()) {
            for (JsonNode element : filesNode) {
                String path = element.get("path").asText();
                long fileSize = element.get("size").asLong();
                Instant modified = Instant.parse(element.get("modified_at").asText());
                String hash = element.hasNonNull("hash") ? element.get("hash").asText() : null;
                boolean deleted = element.hasNonNull("is_deleted") && element.get("is_deleted").asBoolean(false);
                List<String> chunks = new ArrayList<>();
                JsonNode chunksNode = element.get("chunks");
                if (chunksNode != null && chunksNode.isArray()) {
                    for (JsonNode chunk : chunksNode) {
                        if (chunk.isTextual()) chunks.add(chunk.asText());
                        else if (chunk.hasNonNull("hash")) chunks.add(chunk.get("hash").asText());
                    }
                }
                files.add(new ManifestFile(path, fileSize, modified, hash, chunks, deleted));
            }
        }

        return ManifestRecord.builder()
                .id(id)
                .userId(userId)
                .parentManifestId(parent)
                .root(root)
                .repoDir(repoDir)
                .type(backupType)
                .timestamp(timestamp)
                .containerKey(containerKey)
                .backupId(backupId)
                .containerSize(size)
                .containerChecksum(checksum)
                .containerName(containerName)
                .storageBackend(storageBackend)
                .files(files)
                .setId(setId)
                .build();
    }

    private ManifestFile parseManifestFile(JsonNode element) {
        String path = element.get("path").asText();
        long size = element.get("size").asLong();
        Instant modified = Instant.parse(element.get("modified_at").asText());
        String hash = element.hasNonNull("hash_sha256") ? element.get("hash_sha256").asText() : null;
        boolean deleted = element.hasNonNull("is_deleted") && element.get("is_deleted").asBoolean(false);
        return new ManifestFile(path, size, modified, hash, List.of(), deleted);
    }

    private BackupType parseBackupType(String rawType) throws IOException {
        if (rawType == null) {
            throw new IOException("Tipo de backup ausente no manifest");
        }
        String normalized = rawType.toUpperCase(Locale.ROOT);
        if ("DIFFERENTIAL".equals(normalized)) {
            return BackupType.INCREMENTAL;
        }
        try {
            return BackupType.valueOf(normalized);
        } catch (IllegalArgumentException e) {
            throw new IOException("Tipo de backup inválido no manifest: " + rawType, e);
        }
    }

    private HistoryOperationType parseHistoryType(String rawType) {
        if (rawType == null) {
            return HistoryOperationType.INCREMENTAL;
        }
        String normalized = rawType.toUpperCase(Locale.ROOT);
        if ("DIFFERENTIAL".equals(normalized)) {
            return HistoryOperationType.INCREMENTAL;
        }
        try {
            return HistoryOperationType.valueOf(normalized);
        } catch (IllegalArgumentException e) {
            return HistoryOperationType.INCREMENTAL;
        }
    }

    private HistoryRecord parseHistory(JsonNode node) {
        UUID id = node.hasNonNull("id") ? UUID.fromString(node.get("id").asText()) : null;
        String userId = node.get("user_id").asText();
        UUID manifestId = node.hasNonNull("snapshot_id") ? UUID.fromString(node.get("snapshot_id").asText()) : null;
        UUID parent = node.hasNonNull("parent_snapshot_id") ? UUID.fromString(node.get("parent_snapshot_id").asText()) : null;
        String root = node.get("root_path").asText();
        String repoDir = root; // backup_jobs não tem repo_dir separado
        HistoryOperationType type = parseHistoryType(node.get("type").asText());
        HistoryStatus status = HistoryStatus.fromDbStatus(node.get("status").asText());
        long filesTotal = node.hasNonNull("files_scanned") ? node.get("files_scanned").asLong() : 0L;
        long bytesTotal = node.hasNonNull("bytes_total") ? node.get("bytes_total").asLong() : 0L;
        Instant startedAt = Instant.parse(node.get("started_at").asText());
        Instant finishedAt = node.hasNonNull("finished_at") ? Instant.parse(node.get("finished_at").asText()) : null;
        String error = node.hasNonNull("error_message") ? node.get("error_message").asText() : null;
        String containerKey = node.hasNonNull("container_key") ? node.get("container_key").asText() : null;
        String backupId = node.hasNonNull("job_id") ? node.get("job_id").asText() : (id != null ? id.toString() : null);
        UUID setId = node.hasNonNull("set_id") ? UUID.fromString(node.get("set_id").asText()) : null;
        return HistoryRecord.builder()
                .id(id)
                .userId(userId)
                .manifestId(manifestId)
                .parentManifestId(parent)
                .root(root)
                .repoDir(repoDir)
                .type(type)
                .status(status)
                .filesTotal(filesTotal)
                .bytesTotal(bytesTotal)
                .startedAt(startedAt)
                .finishedAt(finishedAt)
                .errorMessage(error)
                .containerKey(containerKey)
                .backupId(backupId)
                .setId(setId)
                .build();
    }

    private ChunkIndexRecord parseChunkIndex(JsonNode node) {
        String userId = node.get("user_id").asText();
        UUID setId = UUID.fromString(node.get("set_id").asText());
        String hash = node.get("hash_sha256").asText();
        String containerKey = node.get("container_key").asText();
        long offset = node.hasNonNull("chunk_offset") ? node.get("chunk_offset").asLong() : 0L;
        long originalSize = node.hasNonNull("original_size") ? node.get("original_size").asLong() : 0L;
        long compressedSize = node.hasNonNull("compressed_size") ? node.get("compressed_size").asLong() : originalSize;
        UUID firstManifest = node.hasNonNull("first_manifest_id") ? UUID.fromString(node.get("first_manifest_id").asText()) : null;
        UUID lastManifest = node.hasNonNull("last_manifest_id") ? UUID.fromString(node.get("last_manifest_id").asText()) : null;
        Instant lastSeen = node.hasNonNull("last_seen_at") ? Instant.parse(node.get("last_seen_at").asText()) : null;
        return ChunkIndexRecord.builder()
                .userId(userId)
                .setId(setId)
                .hash(hash)
                .containerKey(containerKey)
                .offset(offset)
                .originalSize(originalSize)
                .compressedSize(compressedSize)
                .firstManifestId(firstManifest)
                .lastManifestId(lastManifest)
                .lastSeenAt(lastSeen)
                .build();
    }

    // ---- Infra HTTP -------------------------------------------------------

    private HttpUrl baseUrl(String path) {
        return HttpUrl.parse(config.supabaseUrl() + "/rest/v1" + path);
    }

    private Request.Builder baseRequest(HttpUrl url, String accessToken) {
        String token = (accessToken != null && !accessToken.isBlank()) ? accessToken : config.supabaseAnonKey();
        return new Request.Builder()
                .url(url)
                .header("apikey", config.supabaseAnonKey())
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json");
    }

    private JsonNode executeForJsonWithRetry(Request request) throws IOException {
        return withRetry(() -> {
            try (Response response = httpClient.newCall(request).execute()) {
                String raw = bodyString(response.body());
                if (!response.isSuccessful()) {
                    System.err.println("[SUPABASE ERROR] HTTP " + response.code() + " para " + request.url());
                    System.err.println("[SUPABASE ERROR] Response body: " + raw);
                    throw httpError(response.code(), raw, response.headers());
                }
                return raw.isBlank() ? null : mapper.readTree(raw);
            }
        });
    }

    private void executeVoidWithRetry(Request request) throws IOException {
        withRetry(() -> {
            try (Response response = httpClient.newCall(request).execute()) {
                String raw = bodyString(response.body());
                if (!response.isSuccessful()) throw httpError(response.code(), raw, response.headers());
                return null;
            }
        });
    }

    private static String bodyString(ResponseBody body) throws IOException {
        return body != null ? body.string() : "";
    }

    private static IOException httpError(int code, String detail, Headers headers) {
        String msg = "Supabase HTTP " + code + ": " + (detail == null || detail.isBlank() ? "<no-body>" : detail);
        return new IOException(msg);
    }

    private <T> T withRetry(Callable<T> call) throws IOException {
        int attempts = 0;
        long sleepMs = 250;
        IOException last = null;
        while (attempts < 5) {
            try {
                return call.call();
            } catch (IOException e) {
                last = e;
                String m = e.getMessage();
                boolean retryable = m != null && (m.contains("HTTP 429") || m.contains("HTTP 5"));
                if (!retryable) break;
                try { Thread.sleep(sleepMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw new IOException("interrompido", ie); }
                sleepMs = Math.min(4000, (long)(sleepMs * 2.0));
                attempts++;
            } catch (Exception ex) {
                throw new IOException(ex);
            }
        }
        throw last != null ? last : new IOException("Falha desconhecida");
    }

    private UUID extractId(JsonNode node, String table) throws IOException {
        if (node == null || !node.isArray() || node.isEmpty()) throw new IOException("Supabase não retornou registro para " + table);
        JsonNode first = node.get(0);
        if (first == null || !first.hasNonNull("id")) throw new IOException("Supabase não retornou id válido para " + table);
        return UUID.fromString(first.get("id").asText());
    }
}
