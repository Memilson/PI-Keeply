package com.example.backupagent.auth;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import com.example.backupagent.config.AppConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Cliente mínimo para Supabase Auth orientado a sessão.
 *
 * Responsabilidade: - encapsular chamadas HTTP ao endpoint /auth/v1/token, -
 * manter em memória a última AuthSession conhecida, - expor operações de
 * login/refresh/clear.
 */
public final class AuthClient {

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private final AppConfig config;
    private final OkHttpClient httpClient;
    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicReference<AuthSession> sessionRef = new AtomicReference<>();

    /**
     * Construtor padrão usando um OkHttpClient com timeouts razoáveis.
     */
    public AuthClient(AppConfig config) {
        this(config, defaultClient());
    }

    /**
     * Construtor permitindo injetar um OkHttpClient (útil para testes).
     */
    public AuthClient(AppConfig config, OkHttpClient httpClient) {
        this.config = Objects.requireNonNull(config, "config");
        this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
    }

    private static OkHttpClient defaultClient() {
        return new OkHttpClient.Builder()
                .callTimeout(Duration.ofSeconds(30))
                .connectTimeout(Duration.ofSeconds(30))
                .readTimeout(Duration.ofSeconds(30))
                .writeTimeout(Duration.ofSeconds(30))
                .build();
    }

    /**
     * Realiza login por e-mail/senha junto ao Supabase e registra a sessão em
     * memória.
     */
    public AuthSession login(String email, String password) throws IOException {
        Objects.requireNonNull(email, "email");
        Objects.requireNonNull(password, "password");

        HttpUrl base = HttpUrl.parse(config.supabaseUrl());
        if (base == null) {
            throw new IllegalStateException("SUPABASE_URL inválida");
        }

        // POST {SUPABASE_URL}/auth/v1/token?grant_type=password
        HttpUrl url = base.newBuilder()
                .addPathSegment("auth")
                .addPathSegment("v1")
                .addPathSegment("token")
                .addQueryParameter("grant_type", "password")
                .build();

        // Body JSON: { "email": ..., "password": ... }
        String jsonPayload = mapper.createObjectNode()
                .put("email", email)
                .put("password", password)
                .toString();

        Request request = baseRequest(url)
                .post(RequestBody.create(jsonPayload, JSON))
                .build();

        AuthSession session = executeAuthRequest(request);
        sessionRef.set(session);
        return session;
    }

    /**
     * Retorna a sessão atual em memória, se existir.
     */
    public Optional<AuthSession> currentSession() {
        return Optional.ofNullable(sessionRef.get());
    }

    /**
     * Tenta renovar o access token usando o refresh token. Em caso de sucesso,
     * a nova sessão substitui a anterior.
     */
    public AuthSession refresh(String refreshToken) throws IOException {
        Objects.requireNonNull(refreshToken, "refreshToken");

        HttpUrl base = HttpUrl.parse(config.supabaseUrl());
        if (base == null) {
            throw new IllegalStateException("SUPABASE_URL inválida");
        }

        // POST {SUPABASE_URL}/auth/v1/token?grant_type=refresh_token
        HttpUrl url = base.newBuilder()
                .addPathSegment("auth")
                .addPathSegment("v1")
                .addPathSegment("token")
                .addQueryParameter("grant_type", "refresh_token")
                .build();

        // Body JSON: { "refresh_token": ... }
        String jsonPayload = mapper.createObjectNode()
                .put("refresh_token", refreshToken)
                .toString();

        Request request = baseRequest(url)
                .post(RequestBody.create(jsonPayload, JSON))
                .build();

        AuthSession session = executeAuthRequest(request);
        sessionRef.set(session);
        return session;
    }

    /**
     * Limpa a sessão atual em memória.
     */
    public void clear() {
        sessionRef.set(null);
    }

    /**
     * Executa a requisição de auth, tratando erros de forma mais informativa.
     */
    private AuthSession executeAuthRequest(Request request) throws IOException {
        try (Response response = httpClient.newCall(request).execute()) {
            int code = response.code();
            ResponseBody body = response.body();

            if (body == null) {
                throw new IOException("Resposta Supabase vazia (HTTP " + code + ")");
            }

            String bodyString = body.string();

            if (!response.isSuccessful()) {
                // Inclui o corpo da resposta no erro para depuração (mostra JSON retornado)
                String errorMessage = "Erro Supabase Auth: HTTP " + code + " - " + bodyString;
                throw new IOException(errorMessage);
            }

            JsonNode root;
            try {
                root = mapper.readTree(bodyString);
            } catch (Exception e) {
                throw new IOException("Falha ao decodificar resposta Supabase Auth", e);
            }

            JsonNode userNode = root.get("user");
            if (userNode == null || userNode.get("id") == null) {
                throw new IOException("Resposta Supabase sem usuário");
            }

            String accessToken = text(root, "access_token");
            String refreshToken = text(root, "refresh_token");
            long expiresIn = root.has("expires_in") ? root.get("expires_in").asLong() : 3600;
            // margem de segurança mínima de 60s
            Instant expiresAt = Instant.now().plusSeconds(Math.max(60, expiresIn));

            String userId = userNode.get("id").asText();
            String email = userNode.has("email") && !userNode.get("email").isNull()
                    ? userNode.get("email").asText()
                    : null;

            return new AuthSession(userId, email, accessToken, refreshToken, expiresAt);
        }
    }

    private Request.Builder baseRequest(HttpUrl url) {
        return new Request.Builder()
                .url(url)
                .header("apikey", config.supabaseAnonKey())
                // Authorization aqui é opcional; Supabase aceita só com apikey.
                // Se quiser manter:
                .header("Authorization", "Bearer " + config.supabaseAnonKey())
                .header("Content-Type", "application/json")
                .header("Accept", "application/json");
    }

    private static String text(JsonNode node, String field) {
        JsonNode child = node.get(field);
        if (child == null || child.isNull()) {
            return null;
        }
        return child.asText();
    }

    /**
     * Representa sessão autenticada Supabase mantida apenas em memória.
     */
    public static record AuthSession(String userId,
            String email,
            String accessToken,
            String refreshToken,
            Instant expiresAt) {

        public AuthSession     {
            Objects.requireNonNull(userId, "userId");
            Objects.requireNonNull(accessToken, "accessToken");
            Objects.requireNonNull(expiresAt, "expiresAt");
        }

        /**
         * Considera a sessão expirada quando já passou do instante expiresAt -
         * 30s, para evitar usar tokens muito próximos do vencimento.
         */
        public boolean isExpired() {
            return Instant.now().isAfter(expiresAt.minusSeconds(30));
        }
    }

    /**
     * Persistência simples do refresh_token em disco, cifrado com KEEPLY_AGENT_KEY.
     *
     * Uso típico: new AuthClient.SessionTokenStore(SessionTokenStore.defaultPath(), key)
     */
    public static final class SessionTokenStore {

        private static final String TRANSFORMATION = "AES/GCM/NoPadding";
        private static final int IV_LENGTH = 12;
        private static final int TAG_LENGTH_BITS = 128;
        private static final SecureRandom RANDOM = new SecureRandom();

        private final Path path;
        private final SecretKey key;
        private final ObjectMapper mapper = new ObjectMapper();

        public SessionTokenStore(Path path, String rawKey) {
            this.path = Objects.requireNonNull(path, "path");
            if (rawKey == null || rawKey.isBlank()) {
                throw new IllegalStateException("KEEPLY_AGENT_KEY obrigatoria para armazenar refresh token.");
            }
            this.key = deriveKey(rawKey.trim());
        }

        public Optional<String> loadRefreshToken() throws IOException {
            if (!Files.exists(path)) return Optional.empty();
            try {
                String raw = Files.readString(path, StandardCharsets.UTF_8).trim();
                byte[] jsonBytes = decrypt(raw, key);
                RefreshHolder holder = mapper.readValue(jsonBytes, RefreshHolder.class);
                if (holder.refresh_token == null || holder.refresh_token.isBlank()) {
                    return Optional.empty();
                }
                return Optional.of(holder.refresh_token);
            } catch (GeneralSecurityException | IllegalArgumentException e) {
                try { Files.delete(path); } catch (Exception ignored) {}
                return Optional.empty();
            }
        }

        public void persistRefreshToken(String refreshToken) throws IOException {
            Objects.requireNonNull(refreshToken, "refreshToken");
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            byte[] json = mapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsBytes(new RefreshHolder(refreshToken));
            try {
                String encoded = encrypt(json, key);
                Files.writeString(path, encoded, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            } catch (Exception e) {
                throw new IOException("Falha ao criptografar refresh token: " + e.getMessage(), e);
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

        private record RefreshHolder(String refresh_token) {}

        public static Path defaultPath() {
            return Path.of(System.getProperty("user.home"), ".keeply", "session.json.enc");
        }

        public void deleteIfExists() throws IOException {
            Files.deleteIfExists(path);
        }
    }
}
