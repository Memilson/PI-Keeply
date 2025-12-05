package com.example.backupagent.config;

import io.github.cdimascio.dotenv.Dotenv;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AppConfig
 * ----------
 * Responsável por carregar, validar e expor configurações da aplicação.
 *
 * PRINCÍPIOS:
 * - Falhar cedo (validar assim que possível).
 * - Evitar "strings mágicas" (constantes centralizadas).
 * - Precedência previsível em produção: System properties > variáveis de ambiente > .env.
 * - Métodos tipados com limites (int/long/MB) para evitar "foot-guns".
 * - Sem vazamento de segredos em logs (toString() sanitizado).
 *
 * NOTAS:
 * - Usa Dotenv apenas como *última* fonte, preservando prioridade do ambiente.
 * - Força HTTPS no Supabase (segurança).
 * - Impõe limites reais de multipart do S3 (parte máx 5 GiB; threshold >= part size).
 * - Valida região da AWS com regex simples (formato "xx-xxxxx-#").
 */
public final class AppConfig {

    // ======= CHAVES DE CONFIGURAÇÃO (strings centralizadas) =======

    /** URL base do Supabase; deve começar com https e não terminar com "/" após normalização. */
    public static final String SUPABASE_URL = "SUPABASE_URL";
    /** Chave pública (anon) do Supabase. NÃO logar. */
    public static final String SUPABASE_ANON_KEY = "SUPABASE_ANON_KEY";

    /** Endpoint base (Next.js) para as rotas /api/devices. */
    public static final String DEVICE_API_BASE_URL = "DEVICE_API_BASE_URL";

    /** Nome do bucket S3 usado como destino de backups. */
    public static final String AWS_S3_BUCKET = "AWS_S3_BUCKET";
    /** Região do S3 (ex.: us-east-1). Validada por regex. */
    public static final String AWS_S3_REGION = "AWS_S3_REGION";
    /** Algoritmo de criptografia server-side (SSE). Padrão AES256. */
    public static final String AWS_S3_SSE_ALGORITHM = "AWS_S3_SSE_ALGORITHM";
    /** KMS Key ID opcional quando usando SSE-KMS. NÃO logar valor. */
    public static final String AWS_S3_SSE_KMS_KEY_ID = "AWS_S3_SSE_KMS_KEY_ID";
    /** Limiar (MB) para iniciar upload multipart. Deve ser >= part size. */
    public static final String AWS_S3_MULTIPART_THRESHOLD_MB = "AWS_S3_MULTIPART_THRESHOLD_MB";
    /** Tamanho (MB) de cada parte multipart. Mínimo 5 MB, máximo 5 GiB. */
    public static final String AWS_S3_MULTIPART_PART_SIZE_MB = "AWS_S3_MULTIPART_PART_SIZE_MB";
    /** Endpoint alternativo do S3 (compatível: MinIO, Wasabi, Supabase, QNAP, etc.). */
    public static final String AWS_S3_ENDPOINT = "AWS_S3_ENDPOINT";

    /** Nível do Zstd (-19..22). Padrão 4 (bom equilíbrio). */
    public static final String ZSTD_LEVEL = "BACKUP_ZSTD_LEVEL";
    /** Algoritmo de hash (ex.: SHA-256). */
    public static final String HASH_ALGORITHM = "BACKUP_HASH_ALGORITHM";
    /** Expiração (segundos) para URLs de download/restore. Padrão 900 (15 min). */
    public static final String DOWNLOAD_EXPIRATION_SECONDS = "RESTORE_PRESIGNED_EXPIRATION_SECONDS";

    /** Backend de storage: "s3" (padrão) ou "local". Validado. */
    public static final String BACKUP_STORAGE = "BACKUP_STORAGE";
    /** Diretório base quando BACKUP_STORAGE=local; padrão $HOME/keeply-local. */
    public static final String LOCAL_STORAGE_DIR = "LOCAL_STORAGE_DIR";

    /** Credenciais AWS (opcionais; úteis para debug/local/assumir perfis). NÃO logar. */
    public static final String AWS_ACCESS_KEY_ID = "AWS_ACCESS_KEY_ID";
    public static final String AWS_SECRET_ACCESS_KEY = "AWS_SECRET_ACCESS_KEY";
    public static final String AWS_SESSION_TOKEN = "AWS_SESSION_TOKEN";
    /** Chave de API para o agente autenticar nas rotas internas. */
    public static final String AGENT_API_KEY = "AGENT_API_KEY";

    // ======= ARMAZENAMENTO INTERNO =======

    /**
     * Mapa de overrides em runtime (ex.: testes). Tem precedência sobre qualquer fonte.
     * Thread-safe para permitir injeções durante testes concorrentes.
     */
    private final ConcurrentHashMap<String, String> overrides = new ConcurrentHashMap<>();

    /**
     * Valores efetivos carregados (System properties > ENV > .env).
     * Não contém segredos mascarados; são valores reais.
     */
    private final ConcurrentHashMap<String, String> values;

    // ======= CONSTRUÇÃO / CARGA =======

    /**
     * Construtor privado: use load() ou fromMap() para criar instâncias.
     */
    private AppConfig(Map<String, String> values) {
        this.values = new ConcurrentHashMap<>(values);
    }

    /**
     * Carrega configurações de três fontes, com a seguinte precedência:
     * 1) System properties (java -Dchave=valor)
     * 2) Variáveis de ambiente (System.getenv)
     * 3) Arquivo .env (se existir)
     *
     * Decisão: priorizar ambiente para comportamento previsível em produção/containers.
     */
    public static AppConfig load() {
        Dotenv dotenv = Dotenv.configure()
                .ignoreIfMissing()
                .load();

        Map<String, String> map = new ConcurrentHashMap<>();

        // 1) System properties (maior prioridade)
        System.getProperties().forEach((k, v) -> {
            if (k != null && v != null) {
                map.put(String.valueOf(k), String.valueOf(v));
            }
        });

        // 2) Variáveis de ambiente (sobrescrevem system properties se houver conflito)
        System.getenv().forEach(map::put);

        // 3) .env (preenche apenas ausentes)
        dotenv.entries().forEach(e -> map.putIfAbsent(e.getKey(), e.getValue()));

        return new AppConfig(map);
    }

    /**
     * Útil para testes: cria AppConfig a partir de um Map já resolvido.
     */
    public static AppConfig fromMap(Map<String, String> values) {
        return new AppConfig(values);
    }

    // ======= API BÁSICA DE ACESSO =======

    /**
     * Busca valor (overrides > values) e devolve Optional sem brancos.
     */
    public Optional<String> find(String key) {
        Objects.requireNonNull(key, "key");
        String override = overrides.get(key);
        if (override != null) {
            return Optional.of(override);
        }
        String value = values.get(key);
        return value != null && !value.isBlank() ? Optional.of(value.trim()) : Optional.empty();
    }

    /**
     * Busca valor obrigatório; lança IllegalStateException se ausente/inválido.
     */
    public String require(String key) {
        return find(key).orElseThrow(() -> new IllegalStateException("Configuração obrigatória ausente: " + key));
    }

    /**
     * Busca valor com padrão; evita null/blank.
     */
    public String getOrDefault(String key, String defaultValue) {
        return find(key).orElse(defaultValue);
    }

    /**
     * Seta/remover override em runtime (ex.: testes, toggles).
     * Se value==null, remove o override.
     */
    public void override(String key, String value) {
        if (value == null) {
            overrides.remove(key);
        } else {
            overrides.put(key, value);
        }
    }

    // ======= GETTERS ESPECÍFICOS (COM VALIDAÇÃO) =======

    /**
     * URL do Supabase: exige http(s), recusa http em produção (força https) e remove "/" final.
     */
    public String supabaseUrl() {
        String raw = require(SUPABASE_URL).trim();
        if (!raw.startsWith("http")) {
            throw new IllegalStateException("SUPABASE_URL deve começar com http/https");
        }
        if (raw.startsWith("http://")) {
            throw new IllegalStateException("SUPABASE_URL deve usar HTTPS em produção");
        }
        return raw.endsWith("/") ? raw.substring(0, raw.length() - 1) : raw;
    }

    /**
     * Chave pública (anon) do Supabase (uso em client-side/SDK). Não masque aqui, apenas não logue.
     */
    public String supabaseAnonKey() {
        return require(SUPABASE_ANON_KEY);
    }

    /**
     * URL base do backend Next.js para registrar dispositivos. Aceita http/https.
     * Se terminar com "/", remove o sufixo para evitar barras duplas ao montar rotas.
     */
    public String deviceApiBaseUrl() {
        String raw = getOrDefault(DEVICE_API_BASE_URL, "http://localhost:3000");
        raw = raw.trim();
        return raw.endsWith("/") ? raw.substring(0, raw.length() - 1) : raw;
    }

    /**
     * Nome do bucket S3 para destino de backups (obrigatório se storage=s3).
     */
    public String awsBucket() {
        return require(AWS_S3_BUCKET);
    }

    /**
     * Região AWS validada por regex (ex.: us-east-1). Lowercase para consistência.
     */
    public String awsRegion() {
        String r = getOrDefault(AWS_S3_REGION, "us-east-1").trim().toLowerCase(Locale.ROOT);
        if (!r.matches("^[a-z]{2}-[a-z]+-\\d+$")) {
            throw new IllegalStateException("AWS_S3_REGION inválida: " + r);
        }
        return r;
    }

    /**
     * Endpoint alternativo (S3 compatível). Útil para MinIO/Wasabi/Supabase/QNAP.
     */
    public Optional<String> awsEndpointOverride() {
        return find(AWS_S3_ENDPOINT);
    }

    /** Credenciais opcionais (NÃO logar). */
    public Optional<String> awsAccessKeyId() { return find(AWS_ACCESS_KEY_ID); }
    public Optional<String> awsSecretAccessKey() { return find(AWS_SECRET_ACCESS_KEY); }
    public Optional<String> awsSessionToken() { return find(AWS_SESSION_TOKEN); }
    /** API Key opcional para buscar credenciais remotas. */
    public Optional<String> agentApiKey() { return find(AGENT_API_KEY); }

    /**
     * Algoritmo de SSE (server-side encryption). Padrão "AES256".
     * Dica: para KMS use "aws:kms" e forneça sseKmsKeyId().
     */
    public String sseAlgorithm() {
        return getOrDefault(AWS_S3_SSE_ALGORITHM, "AES256");
    }

    /** KMS Key ID para SSE-KMS (opcional). */
    public Optional<String> sseKmsKeyId() {
        return find(AWS_S3_SSE_KMS_KEY_ID);
    }

    /**
     * Threshold para multipart (bytes).
     * Garante: threshold >= partSize e mínimo 5 MB.
     */
    public long multipartThresholdBytes() {
        long part = multipartPartSizeBytes();
        long thr = mbConfigBytes(AWS_S3_MULTIPART_THRESHOLD_MB, 100, 5);
        return Math.max(thr, part);
    }

    /**
     * Tamanho de parte multipart (bytes).
     * Limites do S3: mínimo 5 MB, máximo 5 GiB.
     */
    public long multipartPartSizeBytes() {
        long v = mbConfigBytes(AWS_S3_MULTIPART_PART_SIZE_MB, 16, 5);
        long max = 5L * 1024 * 1024 * 1024; // 5 GiB
        return Math.min(v, max);
    }

    /**
     * Nível de compressão Zstd: -19..22 (como no zstd).
     * Padrão 4 (bom custo/benefício).
     */
    public int zstdLevel() {
        return intConfig(ZSTD_LEVEL, 4, -19, 22);
    }

    /**
     * Algoritmo de hash para conteúdo (ex.: "SHA-256").
     */
    public String hashAlgorithm() {
        return getOrDefault(HASH_ALGORITHM, "SHA-256");
    }

    /**
     * Expiração (segundos) para URLs de restore (presigned).
     * Limites: [60, 86400]. Padrão 900 (15min).
     */
    public long downloadExpirationSeconds() {
        return longConfig(DOWNLOAD_EXPIRATION_SECONDS, 900, 60, 86400);
    }

    /**
     * Backend de storage: "s3" (padrão) ou "local".
     * Qualquer outro valor falha cedo.
     */
    public String storageBackend() {
        String v = getOrDefault(BACKUP_STORAGE, "s3").trim().toLowerCase(Locale.ROOT);
        if (!v.equals("s3") && !v.equals("local")) {
            throw new IllegalStateException("BACKUP_STORAGE inválido: use 's3' ou 'local'");
        }
        return v;
    }

    /**
     * Diretório base quando BACKUP_STORAGE=local.
     * Padrão: $HOME/keeply-local
     */
    public String localStorageDir() {
        return find(LOCAL_STORAGE_DIR)
                .orElseGet(() -> System.getProperty("user.home") + "/keeply-local");
    }

    // ======= HELPERS TIPADOS / QUALIDADE DE VIDA =======

    /**
     * Lê uma flag booleana tolerante a formatos:
     * "true/1/yes" (case-insensitive) → true; senão, false.
     */
    public boolean bool(String key, boolean def) {
        String raw = getOrDefault(key, Boolean.toString(def));
        return raw.equalsIgnoreCase("true")
                || raw.equalsIgnoreCase("1")
                || raw.equalsIgnoreCase("yes");
    }

    /** Converte MB de uma chave para bytes, impondo mínimo e evitando overflow. */
    private long mbConfigBytes(String key, long defaultMb, long minMb) {
        long mb = longConfig(key, defaultMb, minMb, Long.MAX_VALUE / (1024L * 1024L));
        return mb * 1024L * 1024L;
    }

    /** Parser long com faixa [min, max]; se inválido, retorna default. */
    private long longConfig(String key, long def, long min, long max) {
        String raw = getOrDefault(key, Long.toString(def));
        try {
            long v = Long.parseLong(raw.trim());
            if (v < min) return min;
            if (v > max) return max;
            return v;
        } catch (NumberFormatException e) {
            return def;
        }
    }

    /** Parser int com faixa [min, max]; se inválido, retorna default. */
    private int intConfig(String key, int def, int min, int max) {
        String raw = getOrDefault(key, Integer.toString(def));
        try {
            int v = Integer.parseInt(raw.trim());
            if (v < min) return min;
            if (v > max) return max;
            return v;
        } catch (NumberFormatException e) {
            return def;
        }
    }

    // ======= LOGGING SEGURO =======

    /**
     * Representação segura para logs/diagnóstico.
     * - NÃO inclui chaves/segredos.
     * - Mostra somente campos informativos e se opções sensíveis estão "set/unset".
     * - Usa find() para evitar lançar exceções caso algo obrigatório ainda não esteja definido.
     */
    @Override
    public String toString() {
        String backend = safe(() -> storageBackend());
        String region = safe(() -> find(AWS_S3_REGION).orElse("unset"));
        String supa   = safe(() -> find(SUPABASE_URL).orElse("unset"));
        String kms    = sseKmsKeyId().isPresent() ? "set" : "none";
        long partMB   = multipartPartSizeBytes() / (1024 * 1024);
        long thrMB    = multipartThresholdBytes() / (1024 * 1024);

        return "AppConfig{" +
                "storage=" + backend +
                ", region=" + region +
                ", zstd=" + zstdLevel() +
                ", partSizeMB=" + partMB +
                ", thresholdMB=" + thrMB +
                ", sse=" + sseAlgorithm() +
                ", kms=" + kms +
                ", supabaseUrl=" + supa +
                ", awsCreds=" + (awsAccessKeyId().isPresent() ? "set" : "unset") +
                "}";
    }
    /** Helper para não explodir toString() caso getters lancem. */
    private static String safe(SupplierLike supplier) {
        try { return supplier.get(); } catch (Throwable t) { return "error:" + t.getClass().getSimpleName(); }
    }
    /** Interface funcional mínima para evitar dependência de java.util.function em ambientes restritos. */
    @FunctionalInterface
    private interface SupplierLike { String get(); }
}
