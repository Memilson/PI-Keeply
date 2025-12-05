package com.example.backupagent.api.deviceregister;

import com.example.backupagent.config.AppConfig;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.net.UnknownHostException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.logging.Logger;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Fluxo de registro por código de 6 dígitos:
 * 1) Solicita activation_code com device_id, hostname, os, arch.
 * 2) Persiste em disco ( ~/.keeply/device.json ).
 * 3) Consulta activation-status; se ativado, salva agentId/userId.
 */
public final class DeviceRegistrationClient {

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final Logger LOGGER = Logger.getLogger(DeviceRegistrationClient.class.getName());

    private final AppConfig config;
    private final OkHttpClient httpClient;
    private final ObjectMapper mapper;
    private final DeviceIdentityStore identityStore;
    private final DeviceRegistrationStateStore registrationStore;
    private final String agentVersion;
    private final String encryptionKey;

    public DeviceRegistrationClient(AppConfig config, OkHttpClient httpClient, Path statePath) {
        this.config = Objects.requireNonNull(config, "config");
        this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
        this.mapper = new ObjectMapper();
        this.agentVersion = resolveAgentVersion();
        this.encryptionKey = resolveKey(config);
        this.identityStore = new DeviceIdentityStore(agentVersion, DeviceIdentityStore.defaultPath(), encryptionKey);
        this.registrationStore = new DeviceRegistrationStateStore(
                Objects.requireNonNull(statePath, "statePath"),
                Path.of(System.getProperty("user.home"), ".keeply", "device-registration.json"),
                encryptionKey,
                mapper
        );
    }

    public DeviceRegistrationClient(AppConfig config, Path statePath) {
        this(config, defaultHttpClient(), statePath);
    }

    public DeviceRegistrationClient(AppConfig config) {
        this(config, defaultHttpClient(), Path.of(System.getProperty("user.home"), ".keeply", "device-registration.json.enc"));
    }

    public DeviceRegistrationState ensureActivationHandshake(String accessToken, String userId) throws IOException {
        DeviceIdentity identity = identityStore.loadOrCreate();
        Optional<DeviceRegistrationState> stored = safeLoad();

        // 1) Consulta backend primeiro; se reconhecer, persiste e retorna (evita confiar em cache/legado)
        if (accessToken != null && !accessToken.isBlank()) {
            Optional<DeviceRegistrationState> backendState = checkBackendForAgent(accessToken, identity, stored.map(DeviceRegistrationState::activationCode).orElse(null));
            if (backendState.isPresent()) {
                DeviceRegistrationState state = backendState.get();
                registrationStore.persist(state);
                if (state.agentId() != null) {
                    identityStore.persistAgentId(identity, state.agentId());
                }
                if (state.isActivated()) {
                    LOGGER.info(() -> "Agente reconhecido no backend: " + state);
                    return state;
                }
            }
        }

        // 2) Se ainda assim o cache local estiver ativado, use-o (fallback)
        if (stored.filter(DeviceRegistrationState::isActivated).isPresent()) {
            DeviceRegistrationState cached = stored.get();
            LOGGER.info(() -> "Agente já ativado (cache local): " + cached);
            if (cached.agentId() != null) {
                identityStore.persistAgentId(identity, cached.agentId());
            }
            return cached;
        }

        String deviceId = stored.map(DeviceRegistrationState::deviceId).orElse(identity.deviceUuid().toString());
        String existingCode = stored.map(DeviceRegistrationState::activationCode).orElse(null);
        String hardwareId = identity.hardwareFingerprint();

        // Etapa 1: sempre verifica no backend se já existe e está ativo (ou pendente) para este device/hardware.
        if (accessToken != null && !accessToken.isBlank()) {
            Optional<DeviceRegistrationState> backendState = checkBackendForAgent(accessToken, identity, existingCode);
            if (backendState.isPresent()) {
                DeviceRegistrationState state = backendState.get();
                registrationStore.persist(state);
                if (state.agentId() != null) {
                    identityStore.persistAgentId(identity, state.agentId());
                }
                LOGGER.info(() -> "Agente reconhecido no backend (etapa 1): " + state);
                return state;
            }
        }

        // Se já temos um código armazenado, verifique status antes de gerar outro.
        if (existingCode != null && !existingCode.isBlank()) {
            Optional<DeviceRegistrationState> found = checkActivation(existingCode, deviceId, hardwareId);
            if (found.isPresent()) {
                DeviceRegistrationState latest = new DeviceRegistrationState(
                        found.get().agentId(),
                        existingCode,
                        deviceId,
                        found.get().userId(),
                        found.get().hostname() != null ? found.get().hostname() : identity.hostname(),
                        found.get().os() != null ? found.get().os() : identity.os(),
                        found.get().arch() != null ? found.get().arch() : identity.arch(),
                        found.get().hardwareId() != null ? found.get().hardwareId() : hardwareId,
                        found.get().registeredAt(),
                        found.get().lastSeenAt());
                registrationStore.persist(latest);
                identityStore.persistAgentId(identity, latest.agentId());
                if (latest.isActivated()) {
                    LOGGER.info(() -> "Agente já ativado pelo backend usando código existente.");
                } else {
                    LOGGER.info(() -> "Agente pendente encontrado; reutilizando activation_code.");
                }
                return latest;
            }
        }

        DeviceRegistrationState pending = requestActivationCode(identity, existingCode);
        registrationStore.persist(pending);
        LOGGER.info(() -> "Activation code obtido: " + pending.activationCode());

        Optional<DeviceRegistrationState> activated = checkActivation(pending.activationCode(), pending.deviceId(), pending.hardwareId());
        if (activated.isPresent()) {
            DeviceRegistrationState active = pending.withAgent(
                    activated.get().agentId(),
                    activated.get().userId(),
                    activated.get().registeredAt(),
                    activated.get().lastSeenAt());
            registrationStore.persist(active);
            identityStore.persistAgentId(identity, active.agentId());
            LOGGER.info(() -> "Agente ativado: " + active);
            return active;
        }

        return pending;
    }

    public Optional<DeviceRegistrationState> completeActivationIfPossible(DeviceRegistrationState current) throws IOException {
        Objects.requireNonNull(current, "current");
        Optional<DeviceRegistrationState> activated = checkActivation(current.activationCode(), current.deviceId(), current.hardwareId());
        if (activated.isPresent()) {
            DeviceRegistrationState latest = current.withAgent(
                    activated.get().agentId(),
                    activated.get().userId(),
                    activated.get().registeredAt(),
                    activated.get().lastSeenAt());
            registrationStore.persist(latest);
            identityStore.persistAgentId(identityStore.loadOrCreate(), latest.agentId());
            return Optional.of(latest);
        }
        return Optional.empty();
    }

    public Optional<DeviceRegistrationState> checkActivation(String activationCode, String deviceId, String hardwareId) throws IOException {
        if (activationCode == null || activationCode.isBlank()) return Optional.empty();

        HttpUrl.Builder urlBuilder = HttpUrl.parse(config.deviceApiBaseUrl() + "/api/devices/activation-status")
                .newBuilder()
                .addQueryParameter("code", activationCode);
        if (deviceId != null && !deviceId.isBlank()) urlBuilder.addQueryParameter("device_id", deviceId);
        if (hardwareId != null && !hardwareId.isBlank()) urlBuilder.addQueryParameter("hardware_id", hardwareId);
        HttpUrl url = urlBuilder.build();

        Request request = new Request.Builder().url(url).get().build();
        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                LOGGER.warning(() -> "Falha ao consultar activation-status: HTTP " + response.code());
                return Optional.empty();
            }
            ResponseBody body = response.body();
            if (body == null) return Optional.empty();
            JsonNode json = mapper.readTree(body.string());
            if (!json.path("activated").asBoolean(false)) {
                return Optional.empty();
            }

            JsonNode agent = json.path("agent");
            if (agent == null || agent.isMissingNode()) {
                return Optional.empty();
            }

            String resolvedDeviceId = agent.path("device_id").asText(deviceId);
            return Optional.of(new DeviceRegistrationState(
                    agent.path("id").asText(null),
                    activationCode,
                    resolvedDeviceId,
                    agent.path("user_id").asText(null),
                    agent.path("hostname").asText(null),
                    agent.path("os").asText(null),
                    agent.path("arch").asText(null),
                    json.path("hardware_id").asText(null),
                    agent.path("registered_at").asText(null),
                    agent.path("last_seen_at").asText(null)));
        }
    }

    private DeviceRegistrationState requestActivationCode(DeviceIdentity identity, String existingCode) throws IOException {
        ObjectNode payload = mapper.createObjectNode();
        payload.put("device_id", identity.deviceUuid().toString());
        payload.put("hostname", identity.hostname());
        payload.put("os", identity.os());
        payload.put("arch", identity.arch());
        payload.put("hardware_id", identity.hardwareFingerprint());
        payload.put("agent_version", identity.agentVersion());
        payload.put("name", identity.hostname());
        if (existingCode != null && !existingCode.isBlank()) {
            payload.put("activation_code", existingCode);
        }

        Request request = new Request.Builder()
                .url(config.deviceApiBaseUrl() + "/api/devices/request-activation")
                .post(RequestBody.create(payload.toString(), JSON))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (response.code() == 409 && existingCode != null) {
                LOGGER.warning(() -> "Activation code existente em uso; solicitando novo.");
                return requestActivationCode(identity, null);
            }

            ResponseBody body = response.body();
            String bodyStr = body != null ? body.string() : null;

            if (!response.isSuccessful()) {
                String msg = "Falha ao solicitar activation_code: HTTP " + response.code();
                if (bodyStr != null && !bodyStr.isBlank()) {
                    msg += " body=" + bodyStr;
                }
                throw new IOException(msg);
            }
            if (bodyStr == null || bodyStr.isBlank()) throw new IOException("Resposta vazia ao solicitar activation_code");

            JsonNode json = mapper.readTree(bodyStr);
            String activationCode = json.path("activation_code").asText(null);
            JsonNode agent = json.path("agent");

            if (activationCode == null || activationCode.isBlank()) {
                throw new IOException("Backend nao retornou activation_code");
            }

            String id = agent != null && !agent.isMissingNode() ? agent.path("id").asText(null) : null;
            String userId = agent != null && !agent.isMissingNode() ? agent.path("user_id").asText(null) : null;
            String registeredAt = agent != null && !agent.isMissingNode() ? agent.path("registered_at").asText(null) : null;
            String lastSeenAt = agent != null && !agent.isMissingNode() ? agent.path("last_seen_at").asText(null) : null;
            String resolvedDeviceId = agent != null && !agent.isMissingNode()
                    ? agent.path("device_id").asText(identity.deviceUuid().toString())
                    : identity.deviceUuid().toString();

            return new DeviceRegistrationState(id, activationCode, resolvedDeviceId, userId, identity.hostname(), identity.os(), identity.arch(), identity.hardwareFingerprint(), registeredAt, lastSeenAt);
        }
    }

    private Optional<DeviceRegistrationState> safeLoad() {
        try {
            return registrationStore.load();
        } catch (IOException e) {
            LOGGER.warning(() -> "Estado local de device ignorado: " + e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<DeviceRegistrationState> lookupByDeviceId(String accessToken, String deviceId) {
        try {
            HttpUrl url = HttpUrl.parse(config.deviceApiBaseUrl() + "/api/devices")
                    .newBuilder()
                    .addQueryParameter("device_id", deviceId)
                    .build();
            Request request = new Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer " + accessToken)
                    .get()
                    .build();
            try (Response response = httpClient.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    // tenta lookup por hardware_id se o device_id não foi encontrado
                    return Optional.empty();
                }
                ResponseBody body = response.body();
                if (body == null) return Optional.empty();
                JsonNode json = mapper.readTree(body.string());
                JsonNode devices = json.path("devices");
                if (!devices.isArray() || devices.size() == 0) return Optional.empty();
                JsonNode row = devices.get(0);
                return Optional.of(new DeviceRegistrationState(
                        row.path("id").asText(null),
                        row.path("activation_code").asText("000000"),
                        row.path("device_id").asText(deviceId),
                        row.path("user_id").asText(null),
                        row.path("hostname").asText(null),
                        row.path("os").asText(null),
                        row.path("arch").asText(null),
                        row.path("hardware_id").asText(null),
                        row.path("registered_at").asText(null),
                        row.path("last_seen_at").asText(null)));
            }
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private Optional<DeviceRegistrationState> lookupByHardwareId(String accessToken, String hardwareId) {
        if (hardwareId == null || hardwareId.isBlank()) return Optional.empty();
        try {
            HttpUrl url = HttpUrl.parse(config.deviceApiBaseUrl() + "/api/devices")
                    .newBuilder()
                    .addQueryParameter("hardware_id", hardwareId)
                    .build();
            Request request = new Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer " + accessToken)
                    .get()
                    .build();
            try (Response response = httpClient.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    return Optional.empty();
                }
                ResponseBody body = response.body();
                if (body == null) return Optional.empty();
                JsonNode json = mapper.readTree(body.string());
                JsonNode devices = json.path("devices");
                if (!devices.isArray() || devices.size() == 0) return Optional.empty();
                JsonNode row = devices.get(0);
                return Optional.of(new DeviceRegistrationState(
                        row.path("id").asText(null),
                        row.path("activation_code").asText("000000"),
                        row.path("device_id").asText(null),
                        row.path("user_id").asText(null),
                        row.path("hostname").asText(null),
                        row.path("os").asText(null),
                        row.path("arch").asText(null),
                        row.path("hardware_id").asText(null),
                        row.path("registered_at").asText(null),
                        row.path("last_seen_at").asText(null)));
            }
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private Optional<DeviceRegistrationState> checkBackendForAgent(String accessToken, DeviceIdentity identity, String existingCode) {
        String deviceId = identity.deviceUuid().toString();
        String hardwareId = identity.hardwareFingerprint();

        Optional<DeviceRegistrationState> byDevice = lookupByDeviceId(accessToken, deviceId);
        if (byDevice.isPresent()) {
            return Optional.of(enrichWithIdentity(byDevice.get(), identity, deviceId, hardwareId, existingCode));
        }

        if (hardwareId != null && !hardwareId.isBlank()) {
            Optional<DeviceRegistrationState> byHardware = lookupByHardwareId(accessToken, hardwareId);
            if (byHardware.isPresent()) {
                DeviceRegistrationState resolved = byHardware.get();
                String resolvedDeviceId = resolved.deviceId() != null ? resolved.deviceId() : deviceId;
                return Optional.of(enrichWithIdentity(resolved, identity, resolvedDeviceId, hardwareId, existingCode));
            }
        }
        return Optional.empty();
    }

    private DeviceRegistrationState enrichWithIdentity(DeviceRegistrationState backend,
                                                       DeviceIdentity identity,
                                                       String deviceId,
                                                       String hardwareId,
                                                       String existingCode) {
        String code = backend.activationCode() != null && !backend.activationCode().isBlank()
                ? backend.activationCode()
                : existingCode != null ? existingCode : "000000";
        return new DeviceRegistrationState(
                backend.agentId(),
                code,
                deviceId,
                backend.userId(),
                backend.hostname() != null ? backend.hostname() : identity.hostname(),
                backend.os() != null ? backend.os() : identity.os(),
                backend.arch() != null ? backend.arch() : identity.arch(),
                backend.hardwareId() != null ? backend.hardwareId() : hardwareId,
                backend.registeredAt(),
                backend.lastSeenAt());
    }

    private String resolveAgentVersion() {
        String version = DeviceRegistrationClient.class.getPackage().getImplementationVersion();
        if (version != null && !version.isBlank()) {
            return version;
        }
        return "1.0.0";
    }

    private static OkHttpClient defaultHttpClient() {
        return new OkHttpClient.Builder()
                .callTimeout(Duration.ofSeconds(30))
                .connectTimeout(Duration.ofSeconds(10))
                .readTimeout(Duration.ofSeconds(20))
                .writeTimeout(Duration.ofSeconds(20))
                .build();
    }

    private String resolveKey(AppConfig config) {
        return config.find("KEEPLY_AGENT_KEY")
                .or(() -> Optional.ofNullable(System.getenv("KEEPLY_AGENT_KEY")))
                .orElseThrow(() -> new IllegalStateException("KEEPLY_AGENT_KEY obrigatoria para armazenar identidade/registro criptografados."));
    }

    // --- Classes internas unificadas ---

    /**
     * Representa a identidade lógica e persistida do dispositivo/agente.
     */
    public static final class DeviceIdentity {

        private final UUID deviceUuid;
        private final String hardwareFingerprint;
        private final String hostname;
        private final String os;
        private final String osVersion;
        private final String arch;
        private final String createdAt;
        private final String agentVersion;
        private final String agentId;

        @JsonCreator
        public DeviceIdentity(
                @JsonProperty(value = "device_uuid", required = true) UUID deviceUuid,
                @JsonProperty(value = "hardware_fingerprint", required = true) String hardwareFingerprint,
                @JsonProperty(value = "hostname", required = true) String hostname,
                @JsonProperty(value = "os", required = true) String os,
                @JsonProperty("os_version") String osVersion,
                @JsonProperty("arch") String arch,
                @JsonProperty(value = "created_at", required = true) String createdAt,
                @JsonProperty(value = "agent_version", required = true) String agentVersion,
                @JsonProperty("agent_id") String agentId) {
            this.deviceUuid = Objects.requireNonNull(deviceUuid, "deviceUuid");
            this.hardwareFingerprint = Objects.requireNonNull(hardwareFingerprint, "hardwareFingerprint");
            this.hostname = Objects.requireNonNull(hostname, "hostname");
            this.os = Objects.requireNonNull(os, "os");
            this.osVersion = osVersion;
            this.arch = arch;
            this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
            this.agentVersion = Objects.requireNonNull(agentVersion, "agentVersion");
            this.agentId = agentId;
        }

        @JsonProperty("device_uuid")
        public UUID deviceUuid() { return deviceUuid; }
        @JsonProperty("hardware_fingerprint")
        public String hardwareFingerprint() { return hardwareFingerprint; }
        @JsonProperty("hostname")
        public String hostname() { return hostname; }
        @JsonProperty("os")
        public String os() { return os; }
        @JsonProperty("os_version")
        public String osVersion() { return osVersion; }
        @JsonProperty("arch")
        public String arch() { return arch; }
        @JsonProperty("created_at")
        public String createdAt() { return createdAt; }
        @JsonProperty("agent_version")
        public String agentVersion() { return agentVersion; }
        @JsonProperty("agent_id")
        public String agentId() { return agentId; }

        public DeviceIdentity withAgentId(String newAgentId) {
            if (Objects.equals(this.agentId, newAgentId)) return this;
            return new DeviceIdentity(deviceUuid, hardwareFingerprint, hostname, os, osVersion, arch, createdAt, agentVersion, newAgentId);
        }

        public static DeviceIdentity fromHardware(HardwareInfoCollector.HardwareSnapshot snapshot, UUID deviceUuid, String agentVersion) {
            String created = Instant.now().toString();
            return new DeviceIdentity(
                    deviceUuid,
                    snapshot.hardwareFingerprint(),
                    snapshot.hostname(),
                    snapshot.os(),
                    snapshot.osVersion(),
                    snapshot.arch(),
                    created,
                    agentVersion,
                    null
            );
        }

        @Override
        public String toString() {
            return "DeviceIdentity{" +
                    "deviceUuid=" + deviceUuid +
                    ", hardwareFingerprint='" + hardwareFingerprint + '\'' +
                    ", hostname='" + hostname + '\'' +
                    ", os='" + os + " " + (osVersion != null ? osVersion : "") + '\'' +
                    ", arch='" + arch + '\'' +
                    ", agentVersion='" + agentVersion + '\'' +
                    ", agentId='" + agentId + '\'' +
                    ", createdAt='" + createdAt + '\'' +
                    '}';
        }
    }

    /**
     * Coleta informações estáveis de hardware/OS e gera fingerprint SHA-256.
     */
    public static final class HardwareInfoCollector {

        public record HardwareSnapshot(String hostname,
                                       String os,
                                       String osVersion,
                                       String arch,
                                       String machineId,
                                       String hardwareFingerprint) {}

        public HardwareSnapshot collect() {
            String hostname = detectHostname().orElse("unknown-host");
            String os = System.getProperty("os.name", "unknown");
            String osVersion = System.getProperty("os.version", "unknown");
            String arch = System.getProperty("os.arch", "unknown");
            String machineId = detectMachineId().orElse(null);
            String fingerprint = buildFingerprint(hostname, os, osVersion, arch, machineId);
            return new HardwareSnapshot(hostname, os, osVersion, arch, machineId, fingerprint);
        }

        private Optional<String> detectHostname() {
            try {
                return Optional.ofNullable(InetAddress.getLocalHost().getHostName());
            } catch (UnknownHostException e) {
                String env = System.getenv("COMPUTERNAME");
                if (env != null && !env.isBlank()) return Optional.of(env);
                env = System.getenv("HOSTNAME");
                if (env != null && !env.isBlank()) return Optional.of(env);
                return Optional.empty();
            }
        }

        private Optional<String> detectMachineId() {
            String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
            try {
                if (os.contains("win")) {
                    return readWindowsMachineGuid();
                }
                if (os.contains("nix") || os.contains("nux") || os.contains("mac") || os.contains("linux")) {
                    return readLinuxMachineId();
                }
            } catch (Exception ignored) {}
            return Optional.empty();
        }

        private Optional<String> readLinuxMachineId() throws IOException {
            Path machineIdPath = Path.of("/etc/machine-id");
            if (!Files.exists(machineIdPath)) return Optional.empty();
            String raw = Files.readString(machineIdPath, StandardCharsets.UTF_8).trim();
            return raw.isBlank() ? Optional.empty() : Optional.of(raw);
        }

        private Optional<String> readWindowsMachineGuid() throws IOException, InterruptedException {
            Process process = new ProcessBuilder("reg", "query",
                    "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
                    "/v", "MachineGuid")
                    .redirectErrorStream(true)
                    .start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            process.waitFor();
            for (String line : output.split("\\R")) {
                if (line.contains("MachineGuid")) {
                    String[] parts = line.trim().split("\\s+");
                    if (parts.length > 1) {
                        String guid = parts[parts.length - 1].trim();
                        if (!guid.isBlank()) return Optional.of(guid);
                    }
                }
            }
            return Optional.empty();
        }

        private String buildFingerprint(String hostname, String os, String osVersion, String arch, String machineId) {
            try {
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                sha.update(Objects.toString(hostname, "").getBytes(StandardCharsets.UTF_8));
                sha.update("|".getBytes(StandardCharsets.UTF_8));
                sha.update(Objects.toString(os, "").getBytes(StandardCharsets.UTF_8));
                sha.update("|".getBytes(StandardCharsets.UTF_8));
                sha.update(Objects.toString(osVersion, "").getBytes(StandardCharsets.UTF_8));
                sha.update("|".getBytes(StandardCharsets.UTF_8));
                sha.update(Objects.toString(arch, "").getBytes(StandardCharsets.UTF_8));
                sha.update("|".getBytes(StandardCharsets.UTF_8));
                sha.update(Objects.toString(machineId, "").getBytes(StandardCharsets.UTF_8));
                byte[] digest = sha.digest();
                return bytesToHex(digest);
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException("SHA-256 indisponivel", e);
            }
        }

        private String bytesToHex(byte[] bytes) {
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                sb.append(String.format(Locale.ROOT, "%02x", b));
            }
            return sb.toString();
        }
    }

    /**
     * Persiste DeviceIdentity em JSON (AES-GCM opcional via KEEPLY_AGENT_KEY).
     */
    public static final class DeviceIdentityStore {

        private static final Logger LOGGER = Logger.getLogger(DeviceIdentityStore.class.getName());
        private static final String TRANSFORMATION = "AES/GCM/NoPadding";
        private static final int IV_LENGTH = 12;
        private static final int TAG_LENGTH_BITS = 128;
        private static final SecureRandom RANDOM = new SecureRandom();

        private final Path path;
        private final ObjectMapper mapper = new ObjectMapper();
        private final HardwareInfoCollector collector = new HardwareInfoCollector();
        private final SecretKey key;
        private final String agentVersion;

        public DeviceIdentityStore(String agentVersion, Path path, String rawKey) {
            this.agentVersion = Objects.requireNonNull(agentVersion, "agentVersion");
            this.path = Objects.requireNonNull(path, "path");
            if (rawKey == null || rawKey.isBlank()) {
                throw new IllegalStateException("KEEPLY_AGENT_KEY obrigatoria para armazenar identidade criptografada.");
            }
            this.key = deriveKey(rawKey.trim());
        }

        public DeviceIdentity loadOrCreate() throws IOException {
            Optional<DeviceIdentity> loaded = load();
            if (loaded.isPresent()) return loaded.get();

            HardwareInfoCollector.HardwareSnapshot snapshot = collector.collect();
            DeviceIdentity identity = DeviceIdentity.fromHardware(snapshot, UUID.randomUUID(), agentVersion);
            persist(identity);
            return identity;
        }

        public DeviceIdentity persistAgentId(DeviceIdentity identity, String agentId) throws IOException {
            if (agentId == null || agentId.isBlank()) return identity;
            DeviceIdentity updated = identity.withAgentId(agentId);
            persist(updated);
            return updated;
        }

        private Optional<DeviceIdentity> load() throws IOException {
            if (!Files.exists(path)) return Optional.empty();
            byte[] jsonBytes;
            String raw = Files.readString(path, StandardCharsets.UTF_8);
            try {
                if (key != null) {
                    jsonBytes = decrypt(raw.trim(), key);
                } else {
                    jsonBytes = raw.getBytes(StandardCharsets.UTF_8);
                }
            } catch (GeneralSecurityException | IllegalArgumentException e) {
                // arquivo corrompido/invalido; remove e força re-geracao
                try { Files.delete(path); } catch (Exception ignored) {}
                return Optional.empty();
            }
            DeviceIdentity identity = mapper.readValue(jsonBytes, DeviceIdentity.class);
            return Optional.of(identity);
        }

        public void persist(DeviceIdentity identity) throws IOException {
            Objects.requireNonNull(identity, "identity");
            if (path.getParent() != null) {
                Files.createDirectories(path.getParent());
            }
            byte[] json = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(identity);
            try {
                String encoded = encrypt(json, key);
                Files.writeString(path, encoded, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            } catch (Exception e) {
                throw new IOException("Falha ao criptografar identidade: " + e.getMessage(), e);
            }
        }

        public static Path defaultPath() {
            String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
            if (os.contains("win")) {
                String programData = System.getenv().getOrDefault("ProgramData", "C:\\ProgramData");
                return Path.of(programData, "Keeply", "device.json.enc");
            }
            return Path.of(System.getProperty("user.home"), ".keeply", "device.json.enc");
        }

        private static SecretKey deriveKey(String rawKey) {
            try {
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                byte[] digest = sha.digest(rawKey.getBytes(StandardCharsets.UTF_8));
                return new SecretKeySpec(digest, 0, 32, "AES");
            } catch (Exception e) {
                throw new IllegalStateException("Nao foi possivel derivar chave AES", e);
            }
        }

        private static String encrypt(byte[] plaintext, SecretKey key) throws GeneralSecurityException {
            byte[] iv = new byte[IV_LENGTH];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] encrypted = cipher.doFinal(plaintext);
            ByteBuffer buffer = ByteBuffer.allocate(iv.length + encrypted.length);
            buffer.put(iv);
            buffer.put(encrypted);
            return Base64.getEncoder().encodeToString(buffer.array());
        }

        private static byte[] decrypt(String encoded, SecretKey key) throws GeneralSecurityException {
            byte[] all = Base64.getDecoder().decode(encoded);
            if (all.length < IV_LENGTH + 1) throw new GeneralSecurityException("Payload invalido");
            byte[] iv = new byte[IV_LENGTH];
            byte[] ciphertext = new byte[all.length - IV_LENGTH];
            System.arraycopy(all, 0, iv, 0, IV_LENGTH);
            System.arraycopy(all, IV_LENGTH, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return cipher.doFinal(ciphertext);
        }
    }

    /**
     * Estado persistido do registro do agente na máquina local.
     */
    public static final class DeviceRegistrationState {

        private final String agentId;
        private final String activationCode;
        private final String deviceId;
        private final String userId;
        private final String hostname;
        private final String os;
        private final String arch;
        private final String hardwareId;
        private final String registeredAt;
        private final String lastSeenAt;

        @JsonCreator
        public DeviceRegistrationState(
                @JsonProperty("agentId") String agentId,
                @JsonProperty(value = "activationCode", required = true) String activationCode,
                @JsonProperty(value = "deviceId", required = true) String deviceId,
                @JsonProperty("userId") String userId,
                @JsonProperty("hostname") String hostname,
                @JsonProperty("os") String os,
                @JsonProperty("arch") String arch,
                @JsonProperty("hardwareId") String hardwareId,
                @JsonProperty("registeredAt") String registeredAt,
                @JsonProperty("lastSeenAt") String lastSeenAt) {
            this.agentId = agentId;
            this.activationCode = Objects.requireNonNull(activationCode, "activationCode");
            this.deviceId = Objects.requireNonNull(deviceId, "deviceId");
            this.userId = userId;
            this.hostname = hostname;
            this.os = os;
            this.arch = arch;
            this.hardwareId = hardwareId;
            this.registeredAt = registeredAt;
            this.lastSeenAt = lastSeenAt;
        }

        public String agentId() { return agentId; }
        public String activationCode() { return activationCode; }
        public String deviceId() { return deviceId; }
        public String userId() { return userId; }
        public String hostname() { return hostname; }
        public String os() { return os; }
        public String arch() { return arch; }
        public String hardwareId() { return hardwareId; }
        public String registeredAt() { return registeredAt; }
        public String lastSeenAt() { return lastSeenAt; }

        public boolean isActivated() {
            return agentId != null && !agentId.isBlank()
                    && userId != null && !userId.isBlank();
        }

        public DeviceRegistrationState withAgent(String agentId, String userId, String registeredAt, String lastSeenAt) {
            return new DeviceRegistrationState(agentId, activationCode, deviceId, userId, hostname, os, arch, hardwareId, registeredAt, lastSeenAt);
        }

        public static DeviceRegistrationState pending(String activationCode,
                                                      String deviceId,
                                                      String hostname,
                                                      String os,
                                                      String arch,
                                                      String hardwareId) {
            return new DeviceRegistrationState(null, activationCode, deviceId, null, hostname, os, arch, hardwareId, null, null);
        }

        public void persist(Path path, ObjectMapper mapper) throws IOException {
            Objects.requireNonNull(path, "path");
            Objects.requireNonNull(mapper, "mapper");
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            mapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), this);
        }

        public static Optional<DeviceRegistrationState> load(Path path, ObjectMapper mapper) throws IOException {
            Objects.requireNonNull(path, "path");
            Objects.requireNonNull(mapper, "mapper");
            if (!Files.exists(path)) return Optional.empty();
            return Optional.of(mapper.readValue(path.toFile(), DeviceRegistrationState.class));
        }

        @Override
        public String toString() {
            String registered = registeredAt != null ? registeredAt : "pending";
            return "DeviceRegistrationState{" +
                    "agentId='" + agentId + '\'' +
                    ", activationCode='" + activationCode + '\'' +
                    ", deviceId='" + deviceId + '\'' +
                    ", userId='" + userId + '\'' +
                    ", hostname='" + hostname + '\'' +
                    ", os='" + os + '\'' +
                    ", arch='" + arch + '\'' +
                    ", hardwareId='" + hardwareId + '\'' +
                    ", registeredAt=" + (registeredAt != null ? registeredAt : "pending") +
                    ", lastSeenAt=" + (lastSeenAt != null ? lastSeenAt : "n/a") +
                    '}';
        }
    }

    /**
     * Persiste DeviceRegistrationState de forma criptografada (AES-GCM).
     */
    public static final class DeviceRegistrationStateStore {

        private static final String TRANSFORMATION = "AES/GCM/NoPadding";
        private static final int IV_LENGTH = 12;
        private static final int TAG_LENGTH_BITS = 128;
        private static final SecureRandom RANDOM = new SecureRandom();

        private final Path path;
        private final Path legacyPath;
        private final ObjectMapper mapper;
        private final SecretKey key;

        public DeviceRegistrationStateStore(Path path, Path legacyPath, String rawKey, ObjectMapper mapper) {
            this.path = Objects.requireNonNull(path, "path");
            this.legacyPath = Objects.requireNonNull(legacyPath, "legacyPath");
            this.mapper = Objects.requireNonNull(mapper, "mapper");
            if (rawKey == null || rawKey.isBlank()) {
                throw new IllegalStateException("KEEPLY_AGENT_KEY obrigatoria para armazenar estado de registro criptografado.");
            }
            this.key = deriveKey(rawKey.trim());
        }

        public Optional<DeviceRegistrationState> load() throws IOException {
            if (Files.exists(path)) {
                try {
                    String raw = Files.readString(path, StandardCharsets.UTF_8).trim();
                    byte[] jsonBytes = decrypt(raw, key);
                    return Optional.of(mapper.readValue(jsonBytes, DeviceRegistrationState.class));
                } catch (GeneralSecurityException | IllegalArgumentException e) {
                    try { Files.delete(path); } catch (Exception ignored) {}
                    return Optional.empty();
                } catch (Exception e) { // inclui erros de parse Jackson
                    try { Files.delete(path); } catch (Exception ignored) {}
                    return Optional.empty();
                }
            }
            // tenta migrar legado não criptografado
            if (Files.exists(legacyPath)) {
                try {
                    DeviceRegistrationState state = mapper.readValue(legacyPath.toFile(), DeviceRegistrationState.class);
                    persist(state);
                    try { Files.delete(legacyPath); } catch (Exception ignored) {}
                    return Optional.of(state);
                } catch (Exception e) {
                    try { Files.delete(legacyPath); } catch (Exception ignored) {}
                }
            }
            return Optional.empty();
        }

        public void persist(DeviceRegistrationState state) throws IOException {
            Objects.requireNonNull(state, "state");
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            byte[] json = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(state);
            try {
                String encoded = encrypt(json, key);
                Files.writeString(path, encoded, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            } catch (Exception e) {
                throw new IOException("Falha ao criptografar estado de registro: " + e.getMessage(), e);
            }
        }

        private static SecretKey deriveKey(String rawKey) {
            try {
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                byte[] digest = sha.digest(rawKey.getBytes(StandardCharsets.UTF_8));
                return new SecretKeySpec(digest, 0, 32, "AES");
            } catch (Exception e) {
                throw new IllegalStateException("Nao foi possivel derivar chave AES", e);
            }
        }

        private static String encrypt(byte[] plaintext, SecretKey key) throws GeneralSecurityException {
            byte[] iv = new byte[IV_LENGTH];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] encrypted = cipher.doFinal(plaintext);
            ByteBuffer buffer = ByteBuffer.allocate(iv.length + encrypted.length);
            buffer.put(iv);
            buffer.put(encrypted);
            return Base64.getEncoder().encodeToString(buffer.array());
        }

        private static byte[] decrypt(String encoded, SecretKey key) throws GeneralSecurityException {
            byte[] all = Base64.getDecoder().decode(encoded);
            if (all.length < IV_LENGTH + 1) throw new GeneralSecurityException("Payload invalido");
            byte[] iv = new byte[IV_LENGTH];
            byte[] ciphertext = new byte[all.length - IV_LENGTH];
            System.arraycopy(all, 0, iv, 0, IV_LENGTH);
            System.arraycopy(all, IV_LENGTH, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return cipher.doFinal(ciphertext);
        }
    }

    /**
     * Responsável por coletar informações locais da máquina para registrar o agente.
     */
    public static final class MachineInfoCollector {

        public record MachineInfo(String hostname, String os, String arch, String hardwareId) {}

        public MachineInfo collect() {
            String hostname = detectHostname().orElse("unknown-host");
            String os = System.getProperty("os.name", "unknown") + " " + System.getProperty("os.version", "");
            String arch = System.getProperty("os.arch", "unknown");
            String hardwareId = detectHardwareId().orElseGet(() -> fallbackHardwareId(hostname, os));
            return new MachineInfo(hostname, os, arch, hardwareId);
        }

        private Optional<String> detectHostname() {
            try {
                return Optional.ofNullable(InetAddress.getLocalHost().getHostName());
            } catch (UnknownHostException e) {
                String fromEnv = System.getenv("COMPUTERNAME");
                if (fromEnv != null && !fromEnv.isBlank()) return Optional.of(fromEnv);
                fromEnv = System.getenv("HOSTNAME");
                return fromEnv != null && !fromEnv.isBlank() ? Optional.of(fromEnv) : Optional.empty();
            }
        }

        private Optional<String> detectHardwareId() {
            try {
                Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                if (interfaces == null) return Optional.empty();
                for (NetworkInterface nif : Collections.list(interfaces)) {
                    if (nif == null || nif.isLoopback() || nif.isVirtual()) continue;
                    byte[] mac = nif.getHardwareAddress();
                    if (mac != null && mac.length > 0) {
                        return Optional.of(bytesToHex(mac));
                    }
                }
            } catch (SocketException ignored) {
            }
            return Optional.empty();
        }

        private String fallbackHardwareId(String hostname, String os) {
            try {
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                sha.update(Objects.toString(hostname, "").getBytes());
                sha.update(Objects.toString(os, "").getBytes());
                sha.update(Objects.toString(System.getProperty("user.name"), "").getBytes());
                byte[] digest = sha.digest();
                return bytesToHex(digest).substring(0, 24);
            } catch (NoSuchAlgorithmException e) {
                return hostname + "-" + os;
            }
        }

        private String bytesToHex(byte[] bytes) {
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format(Locale.ROOT, "%02x", b));
            }
            return sb.toString();
        }
    }
}
