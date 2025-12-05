package com.example.backupagent.tasks;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

import com.example.backupagent.api.deviceregister.DeviceRegistrationClient.DeviceRegistrationState;
import com.example.backupagent.backup.Backup.BackupCoordinator;
import com.example.backupagent.backup.Backup.BackupResult;
import com.example.backupagent.config.AppConfig;
import com.example.backupagent.restore.Restore.RestoreResult;
import com.example.backupagent.restore.Restore.RestoreService;
import com.example.backupagent.session.SessionManager;
import com.example.backupagent.storage.Storage.LocalBackupLocation;
import com.example.backupagent.storage.Storage.S3ObjectStore;
import com.example.backupagent.storage.Storage.S3Uploader;
import com.example.backupagent.storage.Storage.StorageBackend;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import software.amazon.awssdk.core.exception.SdkClientException;

/**
 * Polling robusto para consumir tarefas do backend.
 * Correções:
 * 1. Tratamento correto de NullNode do Jackson.
 * 2. Logs mais claros sobre o ciclo de vida da tarefa.
 * 3. Prevenção de travamentos silenciosos.
 */
public final class AgentTaskPoller implements AutoCloseable {

    private static final Logger LOGGER = Logger.getLogger(AgentTaskPoller.class.getName());
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private final SessionManager sessionManager;
    private final BackupCoordinator backupCoordinator;
    private final RestoreService restoreService;
    private final DeviceRegistrationState registrationState;
    private final LocalBackupLocation localBackupLocation;
    private final AppConfig config;
    private final OkHttpClient httpClient;
    private final ObjectMapper mapper;
    private final String baseUrl;
    private final ScheduledExecutorService scheduler;
    private final Duration interval;
    private final StorageBackend defaultBackend;
    private final boolean cloudEnabled;
    private final S3Uploader cloudUploader;
    private final S3ObjectStore cloudObjectStore;
    
    // Rastreamento de tarefa em execução para cancelamento
    private volatile String currentTaskId = null;
    private volatile String currentTaskType = null;

    public AgentTaskPoller(SessionManager sessionManager,
                           BackupCoordinator backupCoordinator,
                           RestoreService restoreService,
                           DeviceRegistrationState registrationState,
                           LocalBackupLocation localBackupLocation,
                           AppConfig config,
                           String baseUrl,
                           Duration interval,
                           StorageBackend defaultBackend,
                           boolean cloudEnabled,
                           S3Uploader cloudUploader,
                           S3ObjectStore cloudObjectStore) {
        this.sessionManager = Objects.requireNonNull(sessionManager, "sessionManager");
        this.backupCoordinator = Objects.requireNonNull(backupCoordinator, "backupCoordinator");
        this.restoreService = Objects.requireNonNull(restoreService, "restoreService");
        this.registrationState = Objects.requireNonNull(registrationState, "registrationState");
        this.localBackupLocation = Objects.requireNonNull(localBackupLocation, "localBackupLocation");
        this.config = Objects.requireNonNull(config, "config");
        this.baseUrl = Objects.requireNonNull(baseUrl, "baseUrl");
        this.interval = interval != null ? interval : Duration.ofSeconds(15);
        this.defaultBackend = defaultBackend != null ? defaultBackend : StorageBackend.CLOUD;
        this.cloudEnabled = cloudEnabled;
        this.cloudUploader = cloudUploader;
        this.cloudObjectStore = cloudObjectStore;
        
        // Timeout maior para evitar desconexões em redes instáveis
        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build();
                
        this.mapper = new ObjectMapper();
        this.scheduler = Executors.newSingleThreadScheduledExecutor();
    }

    public void start() {
        // Delay inicial de 2s, repete conforme intervalo configurado
        scheduler.scheduleWithFixedDelay(this::runOnce, 2, interval.toSeconds(), TimeUnit.SECONDS);
        LOGGER.info("Task Poller iniciado. Intervalo: " + interval.toSeconds() + "s");
    }

    private void runOnce() {
        String token = null;
        try {
            token = sessionManager.accessToken();
            
            // Atualizar heartbeat antes de buscar tarefas
            updateHeartbeat(token);
            
            JsonNode task = claimTask(token);
            
            // Verificação rigorosa de Nulo/Missing
            if (task == null || task.isMissingNode() || task.isNull()) {
                // Silencioso para não spammar log quando não tem tarefa
                return;
            }

            String taskId = task.path("id").asText("");
            String taskType = task.path("type").asText("");

            if (taskId.isBlank()) {
                LOGGER.warning("Protocolo inválido: Tarefa recebida sem ID. Ignorando. JSON: " + task);
                return;
            }

            LOGGER.info("[TASK] Recebida: tipo=" + taskType + " id=" + taskId);
            
            // Registra tarefa atual para cancelamento
            currentTaskId = taskId;
            currentTaskType = taskType;
            
            try {
                long start = System.currentTimeMillis();
                executeTask(token, task);
                long duration = System.currentTimeMillis() - start;
                
                LOGGER.info("[TASK] Concluida: id=" + taskId + " duracao=" + duration + "ms. Aguardando proximo polling...");
            } finally {
                // Limpa rastreamento após conclusão (sucesso ou erro)
                currentTaskId = null;
                currentTaskType = null;
            }

        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Erro no ciclo de polling: " + e.getMessage());
            currentTaskId = null;
            currentTaskType = null;
        }
    }

    private JsonNode claimTask(String accessToken) throws IOException {
        String agentId = registrationState.agentId();
        String deviceId = registrationState.deviceId();
        
        ObjectNode payload = mapper.createObjectNode();
        payload.put("device_id", deviceId);
        if (agentId != null && !agentId.isBlank()) {
            payload.put("agent_id", agentId);
        }

        Request request = new Request.Builder()
                .url(baseUrl + "/api/agent-tasks/claim")
                .header("Authorization", "Bearer " + accessToken)
                .post(RequestBody.create(payload.toString(), JSON))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            // 204 No Content = Sem tarefas (Comportamento normal)
            if (response.code() == 204) return null;

            if (!response.isSuccessful()) {
                // Log apenas se for erro real (4xx, 5xx), ignorando 404 se for comum na sua API
                if (response.code() != 404) {
                    LOGGER.warning("Falha ao buscar tarefas: HTTP " + response.code());
                }
                return null;
            }

            ResponseBody body = response.body();
            if (body == null) return null;
            
            String bodyString = body.string();
            if (bodyString.isBlank()) return null;

            JsonNode root = mapper.readTree(bodyString);
            
            // Verifica se a chave "task" existe e se o valor não é null
            if (root.has("task") && !root.get("task").isNull()) {
                return root.get("task");
            }
            
            return null;
        }
    }

    private void executeTask(String accessToken, JsonNode task) {
        String taskId = task.path("id").asText();
        try {
            JsonNode payload = task.path("payload");
            
            // Normalização do tipo da tarefa
            String type = normalizeTaskType(task);
            
            if ("RESTORE".equalsIgnoreCase(type)) {
                executeRestoreTask(accessToken, taskId, payload);
                return;
            }

            if (!"BACKUP".equalsIgnoreCase(type)) {
                LOGGER.info("[TASK] Ignorada (tipo não suportado): " + type);
                completeTask(accessToken, taskId, "SKIPPED", "Tipo não suportado: " + type);
                return;
            }

            // Extração de parâmetros
            String rootPath = extractRootPath(payload);
            StorageBackend backend = resolveBackend(payload);
            String locationId = payload.path("storage_location_id").asText(null);

            if (backend == StorageBackend.CLOUD) {
                if (!applyStorageCredentials(accessToken, taskId, payload)) {
                    return;
                }
            }
            
            // Validações
            if (backend == StorageBackend.CLOUD && !cloudEnabled) {
                completeTask(accessToken, taskId, "ERROR", "Cloud storage desabilitado neste agente");
                return;
            }
            
            if (backend == StorageBackend.LOCAL) {
                if (!configureLocalBackend(payload)) {
                    completeTask(accessToken, taskId, "ERROR", "Destino local inválido");
                    return;
                }
            }

            if (rootPath == null || rootPath.isBlank()) {
                completeTask(accessToken, taskId, "ERROR", "root_path não especificado");
                return;
            }

            Path root = Path.of(rootPath);
            if (!Files.exists(root)) {
                reportTaskError(accessToken, taskId, "Diretorio não encontrado: " + root);
                return;
            }
            if (!Files.isDirectory(root)) {
                reportTaskError(accessToken, taskId, "Caminho não é um diretório: " + root);
                return;
            }

            LOGGER.info("[BACKUP] Iniciando. root=" + root + " backend=" + backend + (locationId != null ? " storage_location_id=" + locationId : ""));
            
            // Execução Síncrona (O Poller espera o backup terminar)
            BackupResult result = backupCoordinator.run(root, backend, registrationState);
            
            LOGGER.info("[BACKUP] Concluido com sucesso. manifesto_id=" + result.manifest().id());
            
            boolean marked = completeTask(accessToken, taskId, "DONE", null);
            if (!marked) {
                LOGGER.warning("Aviso: Tarefa concluída localmente, mas falha ao notificar servidor (DONE).");
            }

        } catch (SdkClientException e) {
            // Thread interrompida (Ctrl+C) durante upload S3
            if (e.getCause() instanceof software.amazon.awssdk.core.exception.AbortedException || 
                Thread.currentThread().isInterrupted()) {
                LOGGER.warning("[BACKUP] Upload cancelado pelo usuário (Ctrl+C)");
                try {
                    completeTask(accessToken, taskId, "CANCELED", "Agente interrompido durante upload");
                } catch (Exception ignored) {}
            } else {
                LOGGER.log(Level.SEVERE, "Falha de SDK S3 durante tarefa " + taskId, e);
                reportTaskError(accessToken, taskId, friendlyError(e));
            }
        } catch (Exception e) {
            // Verifica se foi causado por AbortedException (cancelamento)
            Throwable cause = e.getCause();
            if (cause instanceof software.amazon.awssdk.core.exception.AbortedException || 
                Thread.currentThread().isInterrupted()) {
                LOGGER.warning("[BACKUP] Backup cancelado pelo usuário (Ctrl+C)");
                try {
                    completeTask(accessToken, taskId, "CANCELED", "Agente interrompido durante backup");
                } catch (Exception ignored) {}
            } else {
                LOGGER.log(Level.SEVERE, "Falha durante execução da tarefa " + taskId, e);
                reportTaskError(accessToken, taskId, friendlyError(e));
            }
        }
    }

    private void executeRestoreTask(String accessToken, String taskId, JsonNode payload) {
        try {
            String manifestIdRaw = payload.path("manifest_id").asText(null);
            String rootPath = extractRootPath(payload);
            String destPath = payload.path("dest_path").asText(null);
            StorageBackend backend = resolveBackend(payload);
            String locationId = payload.path("storage_location_id").asText(null);

            if (backend == StorageBackend.CLOUD) {
                if (!applyStorageCredentials(accessToken, taskId, payload)) {
                    return;
                }
            } else if (backend == StorageBackend.LOCAL) {
                if (!configureLocalBackend(payload)) {
                    completeTask(accessToken, taskId, "ERROR", "Destino local inválido para restauração");
                    return;
                }
            }

            if (manifestIdRaw == null || manifestIdRaw.isBlank()) {
                completeTask(accessToken, taskId, "ERROR", "manifest_id não especificado");
                return;
            }
            if (rootPath == null || rootPath.isBlank()) {
                completeTask(accessToken, taskId, "ERROR", "root_path não especificado para restauração");
                return;
            }
            if (destPath == null || destPath.isBlank()) {
                completeTask(accessToken, taskId, "ERROR", "dest_path não especificado para restauração");
                return;
            }

            UUID manifestId = UUID.fromString(manifestIdRaw.trim());
            Path root = Path.of(rootPath.trim());
            Path destination = Path.of(destPath.trim());

            LOGGER.info("[RESTORE] Iniciando. manifest_id=" + manifestId + " root=" + root + " dest=" + destination + (locationId != null ? " storage_location_id=" + locationId : ""));

            RestoreResult result = restoreService.restore(root, manifestId, destination);

            boolean marked = completeTask(accessToken, taskId, "DONE", null);
            if (!marked) {
                LOGGER.warning("Aviso: Restauração concluída localmente, mas falha ao notificar servidor (DONE).");
            }
            LOGGER.info("[RESTORE] Concluida. destino=" + result.destination());

        } catch (SdkClientException e) {
            // Thread interrompida (Ctrl+C) durante download S3
            if (e.getCause() instanceof software.amazon.awssdk.core.exception.AbortedException || 
                Thread.currentThread().isInterrupted()) {
                LOGGER.warning("[RESTORE] Download cancelado pelo usuário (Ctrl+C)");
                try {
                    completeTask(accessToken, taskId, "CANCELED", "Agente interrompido durante download");
                } catch (Exception ignored) {}
            } else {
                LOGGER.log(Level.SEVERE, "Falha de SDK S3 durante restore " + taskId, e);
                reportTaskError(accessToken, taskId, friendlyError(e));
            }
        } catch (Exception e) {
            // Verifica se foi causado por AbortedException (cancelamento)
            Throwable cause = e.getCause();
            if (cause instanceof software.amazon.awssdk.core.exception.AbortedException || 
                Thread.currentThread().isInterrupted()) {
                LOGGER.warning("[RESTORE] Restore cancelado pelo usuário (Ctrl+C)");
                try {
                    completeTask(accessToken, taskId, "CANCELED", "Agente interrompido durante restore");
                } catch (Exception ignored) {}
            } else {
                LOGGER.log(Level.SEVERE, "Falha durante restauração da tarefa " + taskId, e);
                reportTaskError(accessToken, taskId, friendlyError(e));
            }
        }
    }

    // --- Helpers para limpar a lógica principal ---

    private String normalizeTaskType(JsonNode task) {
        String type = task.path("type").asText("");
        JsonNode payload = task.path("payload");
        
        if (type.isBlank()) type = payload.path("kind").asText("");
        if (type.isBlank()) type = payload.path("type").asText("");
        if (type.isBlank()) type = "BACKUP"; // Default legado
        
        if ("run_backup".equalsIgnoreCase(type)) return "BACKUP";
        if ("run_restore".equalsIgnoreCase(type) || "restore".equalsIgnoreCase(type)) return "RESTORE";
        return type;
    }

    /**
     * Busca credenciais remotas via API Key e aplica overrides no AppConfig/S3 clients.
     */
    private boolean applyStorageCredentials(String accessToken, String taskId, JsonNode payload) {
        String locationId = payload.path("storage_location_id").asText(null);
        if (locationId != null && !locationId.isBlank()) {
            // Ignora fetch remoto: usa credenciais locais do agente (.env/ENV).
            LOGGER.info("[BACKUP] Usando credenciais locais (.env) para storage_location_id=" + locationId);
        }
        reloadS3Clients();
        return true;
    }

    private void reloadS3Clients() {
        if (cloudUploader != null) {
            cloudUploader.updateClient(S3Uploader.createClient(config));
        }
        if (cloudObjectStore != null) {
            cloudObjectStore.updateClient(S3ObjectStore.createClient(config));
        }
    }

    private CredentialsResponse fetchCredentials(String locationId, String apiKey) throws IOException {
        HttpUrl url = HttpUrl.parse(baseUrl + "/api/agent/credentials")
                .newBuilder()
                .addQueryParameter("location_id", locationId)
                .build();

        Request request = new Request.Builder()
                .url(url)
                .header("X-Agent-Key", apiKey)
                .get()
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("HTTP " + response.code() + " ao buscar credenciais");
            }
            ResponseBody body = response.body();
            if (body == null) {
                throw new IOException("Resposta vazia ao buscar credenciais");
            }
            JsonNode root = mapper.readTree(body.string());
            JsonNode location = root.path("location");
            JsonNode creds = root.path("credentials");
            if (location == null || location.isMissingNode() || creds == null || creds.isMissingNode()) {
                throw new IOException("Resposta inesperada do backend ao buscar credenciais");
            }
            String bucket = location.path("bucket").asText(null);
            String region = location.path("region").asText(null);
            String endpoint = location.path("endpoint").asText(null);
            String accessKey = creds.path("access_key").asText(null);
            String secretKey = creds.path("secret_key").asText(null);
            if (bucket == null || region == null || accessKey == null || secretKey == null) {
                throw new IOException("Credenciais ou metadata incompletas para o destino");
            }
            return new CredentialsResponse(bucket, region, endpoint, accessKey, secretKey);
        }
    }

    private void applyCredentials(CredentialsResponse response) {
        config.override(AppConfig.AWS_S3_BUCKET, response.bucket());
        config.override(AppConfig.AWS_S3_REGION, response.region());
        if (response.endpoint() != null && !response.endpoint().isBlank()) {
            config.override(AppConfig.AWS_S3_ENDPOINT, response.endpoint());
        }
        config.override(AppConfig.AWS_ACCESS_KEY_ID, response.accessKey());
        config.override(AppConfig.AWS_SECRET_ACCESS_KEY, response.secretKey());
        config.override(AppConfig.AWS_SESSION_TOKEN, null);
    }

    private String extractRootPath(JsonNode payload) {
        String path = payload.path("root_path").asText(null);
        if (path == null) path = payload.path("src_path").asText(null);
        
        if (path != null && path.startsWith("~")) {
            String home = System.getProperty("user.home");
            return path.equals("~") ? home : home + path.substring(1);
        }
        return path;
    }

    private boolean configureLocalBackend(JsonNode payload) {
        String destPath = payload.path("dest_path").asText(null);
        if (destPath != null && !destPath.isBlank()) {
            try {
                localBackupLocation.update(Path.of(destPath));
                return true;
            } catch (IOException e) {
                LOGGER.warning("Erro ao configurar destino local: " + e.getMessage());
                return false;
            }
        }
        return true; // Assume configuração existente se não vier no payload
    }

    private StorageBackend resolveBackend(JsonNode payload) {
        String backendStr = payload.path("storage_backend").asText(null);
        if (backendStr == null) backendStr = payload.path("backend").asText(null);
        
        if (backendStr != null && "s3".equalsIgnoreCase(backendStr)) {
            return StorageBackend.CLOUD;
        }
        if (backendStr != null && "local".equalsIgnoreCase(backendStr)) {
            return StorageBackend.LOCAL;
        }
        return defaultBackend;
    }

    private void reportTaskError(String accessToken, String taskId, String message) {
        try {
            boolean sent = completeTask(accessToken, taskId, "ERROR", message);
            if (!sent) {
                LOGGER.warning("Falha ao reportar erro da tarefa " + taskId + " para o backend.");
            }
        } catch (IOException io) {
            LOGGER.warning("Não foi possível reportar o erro ao servidor: " + io.getMessage());
        }
    }

    private String friendlyError(Exception e) {
        Throwable cause = e;
        while (cause != null) {
            if (cause instanceof NoSuchFileException nfe && nfe.getFile() != null) {
                return "Diretorio não encontrado: " + nfe.getFile();
            }
            if (cause instanceof SdkClientException) {
                String msg = cause.getMessage();
                if (msg != null && msg.contains("Unable to load credentials")) {
                    return "Credenciais AWS ausentes/invalidas. Defina AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY no agente.";
                }
            }
            cause = cause.getCause();
        }
        return e.getMessage() != null ? e.getMessage() : "Erro inesperado durante o backup";
    }

    private void updateHeartbeat(String accessToken) {
        try {
            String agentId = registrationState.agentId();
            String userId = sessionManager.sessionId();
            if (agentId == null || agentId.isBlank() || userId == null || userId.isBlank()) {
                return; // Sem agent_id ou user_id, não pode atualizar
            }

            ObjectNode payload = mapper.createObjectNode();
            payload.put("agent_id", agentId);
            payload.put("user_id", userId);
            payload.put("heartbeat_at", java.time.Instant.now().toString());
            
            // Adiciona informações extras opcionais (pode expandir depois)
            ObjectNode status = mapper.createObjectNode();
            status.put("storage_backend", defaultBackend.name());
            payload.set("status", status);

            Request request = new Request.Builder()
                    .url(baseUrl + "/api/agent-heartbeats")
                    .header("Authorization", "Bearer " + accessToken)
                    .post(RequestBody.create(payload.toString(), JSON))
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful()) {
                    LOGGER.fine("Heartbeat registrado: agent_id=" + agentId);
                } else {
                    LOGGER.warning("Heartbeat falhou: HTTP " + response.code());
                }
            }
        } catch (IOException e) {
            // Heartbeat é best-effort, não deve quebrar o polling
            LOGGER.fine("Falha no heartbeat: " + e.getMessage());
        }
    }

    private boolean completeTask(String accessToken, String taskId, String status, String error) throws IOException {
        ObjectNode node = mapper.createObjectNode();
        node.put("status", status);
        if (error != null) node.put("error", error);

        Request req = new Request.Builder()
                .url(baseUrl + "/api/agent-tasks/" + taskId + "/complete")
                .header("Authorization", "Bearer " + accessToken)
                .post(RequestBody.create(node.toString(), JSON))
                .build();

        try (Response response = httpClient.newCall(req).execute()) {
            return response.isSuccessful();
        }
    }

    /**
     * Cancela a tarefa em execução se houver (chamado no shutdown).
     */
    public void cancelCurrentTask() {
        String taskId = currentTaskId;
        String taskType = currentTaskType;
        
        if (taskId == null) {
            return; // Nenhuma tarefa em execução
        }
        
        LOGGER.warning("[SHUTDOWN] Cancelando tarefa em execução: tipo=" + taskType + " id=" + taskId);
        
        try {
            String token = sessionManager.accessToken();
            completeTask(token, taskId, "CANCELED", "Agente interrompido pelo usuário");
            LOGGER.info("[SHUTDOWN] Tarefa marcada como CANCELED no banco de dados");
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "[SHUTDOWN] Falha ao marcar tarefa como CANCELED: " + e.getMessage());
        }
    }

    @Override
    public void close() {
        cancelCurrentTask(); // Cancela tarefa em execução antes de encerrar
        scheduler.shutdownNow();
        try {
            if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                LOGGER.warning("Forçando encerramento do scheduler...");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private record CredentialsResponse(String bucket, String region, String endpoint, String accessKey, String secretKey) {}
}
