package com.example.backupagent.scan;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.FileSystemLoopException;
import java.nio.file.FileVisitOption;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Módulo de varredura de arquivos usado pelo agente de backup.
 *
 * Responsabilidades principais:
 * - Caminhar uma árvore de diretórios a partir de um root (filesystem "vivo" ou snapshot);
 * - Emitir metadados de arquivos em modo streaming via {@link ScanConsumer};
 * - Opcionalmente calcular hash de conteúdo para verificação/dedupe;
 * - Ser resiliente a erros pontuais (permissão negada, arquivos/atributos problemáticos),
 *   sem derrubar o job inteiro.
 *
 * Não acumula todos os arquivos em memória: quem chama decide o que persistir
 * (banco, manifest, fila de processamento, etc.).
 */
public final class Scanner {

    private Scanner() {}

    /**
     * Representa um arquivo encontrado durante o scan.
     *
     * Contém:
     * - caminho relativo ao root da varredura;
     * - tamanho em bytes (snapshot no momento do scan);
     * - instante da última modificação (snapshot no momento do scan);
     * - hash opcional do conteúdo (pode ser {@code null} quando o hash não é calculado);
     * - snapshot de atributos para detecção de modificações (race condition protection).
     *
     * É imutável para facilitar cache, log e persistência.
     */
    public static final class FileMetadata {
        private final Path relativePath;
        private final long size;
        private final Instant modifiedAt;
        private final String hash;
        private final long snapshotSize;
        private final Instant snapshotModifiedAt;

        public FileMetadata(Path relativePath, long size, Instant modifiedAt, String hash) {
            this(relativePath, size, modifiedAt, hash, size, modifiedAt);
        }

        public FileMetadata(Path relativePath, long size, Instant modifiedAt, String hash, 
                           long snapshotSize, Instant snapshotModifiedAt) {
            this.relativePath = Objects.requireNonNull(relativePath, "relativePath");
            this.size = size;
            this.modifiedAt = Objects.requireNonNull(modifiedAt, "modifiedAt");
            this.hash = hash;
            this.snapshotSize = snapshotSize;
            this.snapshotModifiedAt = Objects.requireNonNull(snapshotModifiedAt, "snapshotModifiedAt");
        }

        public Path relativePath() {
            return relativePath;
        }

        public long size() {
            return size;
        }

        public Instant modifiedAt() {
            return modifiedAt;
        }

        public Optional<String> hash() {
            return Optional.ofNullable(hash);
        }

        public long snapshotSize() {
            return snapshotSize;
        }

        public Instant snapshotModifiedAt() {
            return snapshotModifiedAt;
        }

        /**
         * Verifica se o arquivo foi modificado após o scan comparando com atributos atuais.
         * Retorna true se tamanho ou timestamp mudaram.
         */
        public boolean wasModifiedSince(Path absolutePath) throws IOException {
            if (!Files.exists(absolutePath)) {
                return true; // Arquivo deletado = modificado
            }
            BasicFileAttributes currentAttrs = Files.readAttributes(absolutePath, BasicFileAttributes.class);
            long currentSize = currentAttrs.size();
            Instant currentModified = currentAttrs.lastModifiedTime().toInstant();
            return currentSize != snapshotSize || !currentModified.equals(snapshotModifiedAt);
        }

        /**
         * Caminho normalizado (sempre com '/') para uso consistente
         * em manifest, banco de dados ou APIs independentes de OS.
         */
        public String normalizedPath() {
            return relativePath.toString().replace('\\', '/');
        }
    }

    /**
     * Estatísticas agregadas de um scan.
     *
     * Útil para mostrar para o usuário:
     * - quantos arquivos foram processados;
     * - quantos foram excluídos por filtros;
     * - quantos diretórios foram visitados / pulados por filtros.
     */
    public static final class ScanStatistics {
        private final long filesProcessed;
        private final long filesExcludedByFilter;
        private final long directoriesVisited;
        private final long directoriesSkippedByFilter;

        public ScanStatistics(long filesProcessed,
                              long filesExcludedByFilter,
                              long directoriesVisited,
                              long directoriesSkippedByFilter) {
            this.filesProcessed = filesProcessed;
            this.filesExcludedByFilter = filesExcludedByFilter;
            this.directoriesVisited = directoriesVisited;
            this.directoriesSkippedByFilter = directoriesSkippedByFilter;
        }

        public static ScanStatistics empty() {
            return new ScanStatistics(0, 0, 0, 0);
        }

        public long filesProcessed() {
            return filesProcessed;
        }

        public long filesExcludedByFilter() {
            return filesExcludedByFilter;
        }

        public long directoriesVisited() {
            return directoriesVisited;
        }

        public long directoriesSkippedByFilter() {
            return directoriesSkippedByFilter;
        }

        public ScanStatistics plus(ScanStatistics other) {
            return new ScanStatistics(
                    this.filesProcessed + other.filesProcessed,
                    this.filesExcludedByFilter + other.filesExcludedByFilter,
                    this.directoriesVisited + other.directoriesVisited,
                    this.directoriesSkippedByFilter + other.directoriesSkippedByFilter
            );
        }
    }

    /**
     * Resultado agregado de um scan completo, contendo root, arquivos e estatísticas.
     */
    public static final class ScanResult {
        private final Path root;
        private final Map<Path, FileMetadata> files;
        private final ScanStatistics statistics;

        /**
         * Construtor legado: mantém compatibilidade com código existente.
         * Estatísticas ficam zeradas (sem filtros / sem contagem).
         */
        public ScanResult(Path root, Map<Path, FileMetadata> files) {
            this(root, files, ScanStatistics.empty());
        }

        public ScanResult(Path root, Map<Path, FileMetadata> files, ScanStatistics statistics) {
            this.root = Objects.requireNonNull(root, "root");
            this.files = Map.copyOf(Objects.requireNonNull(files, "files"));
            this.statistics = Objects.requireNonNull(statistics, "statistics");
        }

        public Path root() { return root; }
        public Map<Path, FileMetadata> filesMap() { return files; }
        public java.util.List<FileMetadata> files() { return java.util.List.copyOf(files.values()); }
        public ScanStatistics statistics() { return statistics; }
    }

    /**
     * Resultado de um scan envolvendo múltiplos roots (multi-volume).
     */
    public static final class MultiVolumeScanResult {
        private final Map<Path, ScanResult> perRoot;
        private final Map<Path, IOException> failures;

        public MultiVolumeScanResult(Map<Path, ScanResult> perRoot, Map<Path, IOException> failures) {
            this.perRoot = Map.copyOf(Objects.requireNonNull(perRoot, "perRoot"));
            this.failures = Map.copyOf(Objects.requireNonNull(failures, "failures"));
        }

        /**
         * Map de root -> ScanResult (somente volumes que conseguiram ser escaneados).
         */
        public Map<Path, ScanResult> resultsByRoot() {
            return perRoot;
        }

        /**
         * Map de root -> IOException para volumes que falharam.
         */
        public Map<Path, IOException> failuresByRoot() {
            return failures;
        }
    }

    /**
     * Filtro de exclusão para arquivos/diretórios durante o scan.
     *
     * Usa três coleções:
     * - nomes exatos (case-insensitive) para excluir (arquivos ou diretórios);
     * - extensões (sem ponto, ex: "tmp", "log");
     * - padrões regex aplicados ao caminho normalizado.
     *
     * Implementa Builder para facilitar criação de filtros customizados.
     */
    public static final class ExclusionFilter {

        private final Set<String> excludedNamesLower;
        private final Set<String> excludedExtensionsLower;
        private final List<Pattern> regexPatterns;

        private ExclusionFilter(Set<String> names,
                                Set<String> extensions,
                                List<Pattern> patterns) {
            this.excludedNamesLower = Set.copyOf(names);
            this.excludedExtensionsLower = Set.copyOf(extensions);
            this.regexPatterns = List.copyOf(patterns);
        }

        public static Builder builder() {
            return new Builder();
        }

        /**
         * Filtro "nenhum" (não exclui nada).
         */
        public static ExclusionFilter none() {
            return new Builder().build();
        }

        /**
         * Filtro pré-configurado para lixo típico de Windows:
         * - pagefile.sys, hiberfil.sys, swapfile.sys;
         * - System Volume Information;
         * - Recycle Bin ($RECYCLE.BIN / Recycler / Recycle Bin);
         * - diretórios Temp.
         */
        public static ExclusionFilter forWindowsSystem() {
            return builder()
                    // Arquivos de paginação/hibernação
                    .excludeFileName("pagefile.sys")
                    .excludeFileName("hiberfil.sys")
                    .excludeFileName("swapfile.sys")

                    // Pastas de sistema
                    .excludeFileName("System Volume Information")

                    // Lixeiras
                    .excludeFileName("$RECYCLE.BIN")
                    .excludeFileName("RECYCLE.BIN")
                    .excludeFileName("Recycler")
                    .excludeFileName("Recycle Bin")

                    // Diretórios temporários genéricos
                    .excludeFileName("Temp")
                    .excludeFileName("TMP")

                    // Caches de build/desenvolvimento (arquivos voláteis que mudam frequentemente)
                    .excludeFileName("node_modules")
                    .excludeFileName(".next")
                    .excludeFileName("target")
                    .excludeFileName("build")
                    .excludeFileName("dist")
                    .excludeFileName(".cache")
                    .excludeFileName("__pycache__")
                    .excludeFileName(".venv")
                    .excludeFileName(".gradle")
                    .excludeFileName(".m2")

                    // Regex extra: qualquer caminho contendo /Temp/ ou \Temp\
                    .excludeRegex("(?i).*(\\\\|/)Temp(\\\\|/).*")
                    .build();
        }

        /**
         * Retorna true se o caminho deve ser excluído do scan.
         */
        public boolean shouldExclude(Path path) {
            if (path == null) return false;

            // Checa nome do arquivo/diretório
            Path fileName = path.getFileName();
            if (fileName != null) {
                String name = fileName.toString();
                String lower = name.toLowerCase(Locale.ROOT);
                if (excludedNamesLower.contains(lower)) {
                    return true;
                }
            }

            // Checa extensão (apenas se tiver algo do tipo "nome.ext")
            if (fileName != null) {
                String name = fileName.toString();
                String lower = name.toLowerCase(Locale.ROOT);
                int dot = lower.lastIndexOf('.');
                if (dot > 0 && dot < lower.length() - 1) {
                    String ext = lower.substring(dot + 1);
                    if (excludedExtensionsLower.contains(ext)) {
                        return true;
                    }
                }
            }

            // Checa regex contra o caminho completo normalizado
            if (!regexPatterns.isEmpty()) {
                String normalized = path.toString().replace('\\', '/');
                for (Pattern p : regexPatterns) {
                    if (p.matcher(normalized).find()) {
                        return true;
                    }
                }
            }

            return false;
        }

        /**
         * Builder do ExclusionFilter.
         */
        public static final class Builder {
            private final Set<String> namesLower = new HashSet<>();
            private final Set<String> extensionsLower = new HashSet<>();
            private final List<Pattern> patterns = new ArrayList<>();

            /**
             * Exclui por nome exato de arquivo/diretório (case-insensitive).
             */
            public Builder excludeFileName(String name) {
                if (name != null && !name.isBlank()) {
                    namesLower.add(name.toLowerCase(Locale.ROOT));
                }
                return this;
            }

            /**
             * Exclui por extensão (com ou sem ponto). Ex: "tmp" ou ".tmp".
             */
            public Builder excludeExtension(String extension) {
                if (extension != null && !extension.isBlank()) {
                    String ext = extension.startsWith(".")
                            ? extension.substring(1)
                            : extension;
                    ext = ext.toLowerCase(Locale.ROOT);
                    if (!ext.isBlank()) {
                        extensionsLower.add(ext);
                    }
                }
                return this;
            }

            /**
             * Exclui por regex (String).
             */
            public Builder excludeRegex(String regex) {
                if (regex != null && !regex.isBlank()) {
                    patterns.add(Pattern.compile(regex));
                }
                return this;
            }

            /**
             * Exclui por regex já compilado.
             */
            public Builder excludeRegex(Pattern pattern) {
                if (pattern != null) {
                    patterns.add(pattern);
                }
                return this;
            }

            public ExclusionFilter build() {
                return new ExclusionFilter(namesLower, extensionsLower, patterns);
            }
        }
    }

    /**
     * Contrato de callback chamado pelo {@link ScanService} em modo streaming.
     *
     * Permite que quem chama:
     * - receba cada arquivo à medida que é encontrado (onFileFound);
     * - centralize o tratamento/log de erros não-fatais (onError),
     *   mantendo o scan em progresso.
     */
    public interface ScanConsumer {

        /**
         * Chamado quando um arquivo é processado com sucesso.
         * Aqui normalmente se grava no banco, monta manifest ou enfileira para outra etapa.
         */
        void onFileFound(FileMetadata metadata);

        /**
         * Chamado quando ocorre um erro não-fatal (ex.: permissão negada, erro de leitura).
         * O scanner continuará para o próximo arquivo após este callback.
         */
        void onError(Path path, String message, IOException exc);
    }

    /**
     * Serviço de varredura de diretórios em modo streaming.
     *
     * Características:
     * - Usa {@link Files#walkFileTree} com profundidade e followLinks configuráveis;
     * - Pode ignorar arquivos/diretórios ocultos quando o FS expõe esse atributo;
     * - Opcionalmente calcula hash de conteúdo (custo proporcional ao tamanho do arquivo);
     * - Erros pontuais são reportados via {@link ScanConsumer#onError} e não abortam o job.
     *
     * Pensado para ser usado "um ScanService por job"; não é thread-safe.
     */
    public static final class ScanService {

        private static final HexFormat HEX = HexFormat.of();

        private final boolean computeHash;
        private final String hashAlgorithm;
        private final int maxDepth;
        private final boolean followLinks;
        private final boolean ignoreHidden;

        /**
         * Flag interna para evitar spam de log em caso de filesystem
         * que sempre falha em {@link Files#isHidden(Path)}.
         * Apenas a primeira falha é repassada ao consumidor.
         */
        private boolean hiddenAttrWarningLogged = false;

        /**
         * Construtor padrão seguro:
         * - Sem hash (rápido);
         * - Não segue links simbólicos (evita loops e "vazamento" para outros volumes);
         * - Profundidade ilimitada (até Integer.MAX_VALUE).
         */
        public ScanService() {
            this(false, null, Integer.MAX_VALUE, false, false);
        }

        /**
         * Construtor simplificado:
         * - Permite ligar/desligar hash;
         * - followLinks=false, ignoreHidden=false por padrão.
         */
        public ScanService(boolean computeHash, String hashAlgorithm) {
            this(computeHash, hashAlgorithm, Integer.MAX_VALUE, false, false);
        }

        /**
         * Construtor completo, usado quando o caller quer controle fino sobre o scan.
         */
        public ScanService(boolean computeHash,
                           String hashAlgorithm,
                           int maxDepth,
                           boolean followLinks,
                           boolean ignoreHidden) {
            if (computeHash && (hashAlgorithm == null || hashAlgorithm.isBlank())) {
                throw new IllegalArgumentException("hashAlgorithm é obrigatório quando computeHash=true");
            }
            if (maxDepth <= 0) {
                throw new IllegalArgumentException("maxDepth deve ser >= 1");
            }
            this.computeHash = computeHash;
            this.hashAlgorithm = hashAlgorithm;
            this.maxDepth = maxDepth;
            this.followLinks = followLinks;
            this.ignoreHidden = ignoreHidden;
        }

        /**
         * Executa o scan a partir de {@code root}, emitindo arquivos via {@link ScanConsumer}.
         * Versão compatível (sem filtro explícito).
         *
         * @param root      diretório raiz (ou snapshot montado) a ser varrido
         * @param consumer  implementação que receberá os arquivos e erros
         * @throws IOException apenas em erros fatais de estrutura
         *                      (root inválido, ciclo de symlink, falha geral do walkFileTree)
         */
        public void scan(Path root, ScanConsumer consumer) throws IOException {
            scan(root, consumer, null);
        }

        /**
         * Executa o scan com um {@link ExclusionFilter} opcional.
         *
         * @param root      diretório raiz
         * @param consumer  callback de arquivos/erros
         * @param filter    filtro de exclusão (pode ser null para "sem filtro")
         */
        public void scan(Path root, ScanConsumer consumer, ExclusionFilter filter) throws IOException {
            // Reaproveita mesma implementação interna, mas ignora estatísticas aqui.
            scanInternal(root, consumer, filter);
        }

        /**
         * Versão conveniente que agrega todos os arquivos em memória e devolve um ScanResult.
         */
        public ScanResult scan(Path root) throws IOException {
            return scan(root, (ExclusionFilter) null);
        }

        /**
         * Versão conveniente que agrega todos os arquivos em memória e
         * permite uso de {@link ExclusionFilter}.
         */
        public ScanResult scan(Path root, ExclusionFilter filter) throws IOException {
            Map<Path, FileMetadata> files = new LinkedHashMap<>();

            ScanConsumer consumer = new ScanConsumer() {
                @Override
                public void onFileFound(FileMetadata metadata) {
                    files.put(metadata.relativePath(), metadata);
                }

                @Override
                public void onError(Path path, String message, IOException exc) {
                    // Ignora erros pontuais para manter comportamento tolerante.
                }
            };

            ScanStatistics stats = scanInternal(root, consumer, filter);
            return new ScanResult(root.toAbsolutePath().normalize(), files, stats);
        }

        /**
         * Scan para múltiplos roots (multi-volume).
         *
         * - Itera sobre cada root chamando o scan existente;
         * - Continua mesmo se um root falhar;
         * - Retorna resultados e falhas por volume.
         */
        public MultiVolumeScanResult scanMultiple(List<Path> roots) {
            Objects.requireNonNull(roots, "roots");

            Map<Path, ScanResult> results = new LinkedHashMap<>();
            Map<Path, IOException> failures = new LinkedHashMap<>();

            for (Path root : roots) {
                if (root == null) {
                    continue;
                }
                try {
                    ScanResult result = scan(root, (ExclusionFilter) null);
                    results.put(root.toAbsolutePath().normalize(), result);
                } catch (IOException e) {
                    //noinspection ResultOfMethodCallIgnored
                    failures.put(root, e);
                }
            }

            return new MultiVolumeScanResult(results, failures);
        }

        // --- Implementação interna compartilhada (streaming + agregada) ---

        /**
         * Executa o walkFileTree, aplicando filtro e acumulando estatísticas.
         *
         * @return ScanStatistics do scan efetuado.
         */
        private ScanStatistics scanInternal(Path root, ScanConsumer consumer, ExclusionFilter filter) throws IOException {
            Objects.requireNonNull(root, "root");
            Objects.requireNonNull(consumer, "consumer");

            final ExclusionFilter effectiveFilter = (filter != null) ? filter : ExclusionFilter.none();
            Path canonical = normalize(root);

            // Validação inicial do root
            if (!Files.isDirectory(canonical)) {
                throw new IOException("Caminho não é um diretório válido: " + canonical);
            }

            EnumSet<FileVisitOption> options = followLinks
                    ? EnumSet.of(FileVisitOption.FOLLOW_LINKS)
                    : EnumSet.noneOf(FileVisitOption.class);

            // Reutiliza o MessageDigest no scan inteiro, dando reset a cada arquivo.
            final MessageDigest sharedDigest = computeHash ? newDigest() : null;

            // Acumulador de estatísticas
            final long[] filesProcessed = new long[1];
            final long[] filesExcludedByFilter = new long[1];
            final long[] dirsVisited = new long[1];
            final long[] dirsSkippedByFilter = new long[1];

            try {
                Files.walkFileTree(canonical, options, maxDepth, new SimpleFileVisitor<>() {

                    @Override
                    public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                        // Não filtramos o root em si: quem passou o root sabe o que quer.
                        if (!dir.equals(canonical)) {
                            dirsVisited[0]++;

                            // Primeiro: verificação de filtro antes de entrar na subárvore
                            if (effectiveFilter.shouldExclude(dir)) {
                                dirsSkippedByFilter[0]++;
                                return FileVisitResult.SKIP_SUBTREE;
                            }

                            // Depois: lógica de ocultos
                            if (ignoreHidden && isHiddenSafe(dir, consumer)) {
                                return FileVisitResult.SKIP_SUBTREE;
                            }
                        } else {
                            // Root também conta como visitado, se quiser estatística mais "honesta"
                            dirsVisited[0]++;
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                        // try-catch interno garante que um arquivo problemático não interrompe o scan.
                        try {
                            if (!attrs.isRegularFile()) {
                                return FileVisitResult.CONTINUE;
                            }

                            // Filtro vem antes de qualquer outra coisa
                            if (effectiveFilter.shouldExclude(file)) {
                                filesExcludedByFilter[0]++;
                                return FileVisitResult.CONTINUE;
                            }

                            if (ignoreHidden && isHiddenSafe(file, consumer)) {
                                return FileVisitResult.CONTINUE;
                            }

                            // SNAPSHOT dos atributos ANTES de qualquer I/O (race condition protection)
                            Path relative = canonical.relativize(file);
                            long snapshotSize = attrs.size();
                            Instant snapshotModified = attrs.lastModifiedTime().toInstant();
                            String hash = null;

                            if (computeHash) {
                                hash = hash(file, sharedDigest);
                            }

                            // Re-verifica atributos APÓS hash para detectar modificações durante leitura
                            BasicFileAttributes finalAttrs = Files.readAttributes(file, BasicFileAttributes.class);
                            long finalSize = finalAttrs.size();
                            Instant finalModified = finalAttrs.lastModifiedTime().toInstant();

                            consumer.onFileFound(new FileMetadata(relative, finalSize, finalModified, hash, snapshotSize, snapshotModified));
                            filesProcessed[0]++;

                        } catch (IOException e) {
                            // Erros pontuais (ex.: leitura/hash) são reportados e o scan continua.
                            consumer.onError(file, "Erro de leitura/hash: " + e.getMessage(), e);
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFileFailed(Path file, IOException exc) {
                        // Erros de acesso (ex.: permissão negada) são reportados e scan continua.
                        consumer.onError(file, "Falha ao acessar caminho", exc);
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult postVisitDirectory(Path dir, IOException exc) {
                        if (exc != null) {
                            consumer.onError(dir, "Erro ao finalizar diretório", exc);
                        }
                        return FileVisitResult.CONTINUE;
                    }
                });
            } catch (FileSystemLoopException loop) {
                throw new IOException("Loop de sistema de arquivos detectado (symlink): " + loop.getFile(), loop);
            } catch (IOException e) {
                // Erros fatais que impedem o walkFileTree de continuar.
                throw new IOException("Falha fatal na varredura: " + e.getMessage(), e);
            }

            return new ScanStatistics(
                    filesProcessed[0],
                    filesExcludedByFilter[0],
                    dirsVisited[0],
                    dirsSkippedByFilter[0]
            );
        }

        // --- Métodos Auxiliares ---

        /**
         * Normaliza o root:
         * - tenta {@code toRealPath()} (resolve links, normaliza);
         * - se falhar, cai para {@code absolutePath().normalize()}, desde que exista.
         */
        private Path normalize(Path root) throws IOException {
            try {
                return root.toRealPath();
            } catch (IOException e) {
                Path abs = root.toAbsolutePath().normalize();
                if (!Files.exists(abs)) {
                    throw new IOException("Diretório não encontrado: " + root, e);
                }
                return abs;
            }
        }

        /**
         * Verifica se o caminho é oculto usando {@link Files#isHidden(Path)}.
         *
         * Em caso de falha:
         * - apenas a primeira exceção é repassada ao {@link ScanConsumer#onError}
         *   (controlada por {@link #hiddenAttrWarningLogged});
         * - as próximas falhas de isHidden são suprimidas para evitar spam de log;
         * - o caminho é tratado como NÃO oculto (retorna false), para não pular
         *   arquivos/diretórios silenciosamente durante o backup.
         */
        private boolean isHiddenSafe(Path path, ScanConsumer consumer) {
            try {
                return Files.isHidden(path);
            } catch (IOException e) {
                if (!hiddenAttrWarningLogged) {
                    consumer.onError(
                            path,
                            "Aviso: falha ao verificar atributo 'hidden'; " +
                            "supressão de avisos futuros deste tipo durante este scan.",
                            e
                    );
                    hiddenAttrWarningLogged = true;
                }
                return false;
            }
        }

        /**
         * Calcula o hash de conteúdo de um arquivo usando o {@link MessageDigest} compartilhado.
         * Lê o arquivo inteiro em blocos de 64KB.
         */
        private String hash(Path path, MessageDigest digest) throws IOException {
            digest.reset();
            byte[] buffer = new byte[64 * 1024];
            try (InputStream in = new BufferedInputStream(Files.newInputStream(path))) {
                int read;
                while ((read = in.read(buffer)) != -1) {
                    digest.update(buffer, 0, read);
                }
            }
            return HEX.formatHex(digest.digest());
        }

        /**
         * Cria uma instância de {@link MessageDigest} para o algoritmo configurado.
         */
        private MessageDigest newDigest() throws IOException {
            try {
                return MessageDigest.getInstance(hashAlgorithm);
            } catch (NoSuchAlgorithmException e) {
                throw new IOException("Algoritmo de hash indisponível no sistema: " + hashAlgorithm, e);
            }
        }
    }
}
