package com.example.backupagent;

import com.example.backupagent.api.deviceregister.DeviceRegistrationClient;
import com.example.backupagent.api.deviceregister.DeviceRegistrationClient.DeviceRegistrationState;
import com.example.backupagent.auth.AuthClient;
import com.example.backupagent.auth.AuthClient.SessionTokenStore;
import com.example.backupagent.backup.Backup.BackupCatalogService;
import com.example.backupagent.backup.Backup.BackupCoordinator;
import com.example.backupagent.config.AppConfig;
import com.example.backupagent.diff.DiffModule.DiffPlanner;
import com.example.backupagent.packager.PackagerModule.Packager;
import com.example.backupagent.restore.Restore.RestoreExecutor;
import com.example.backupagent.restore.Restore.RestorePlanner;
import com.example.backupagent.restore.Restore.RestoreService;
import com.example.backupagent.scan.Scanner.ScanService;
import com.example.backupagent.session.SessionManager;
import com.example.backupagent.storage.Storage.LocalBackupLocation;
import com.example.backupagent.storage.Storage.LocalObjectStore;
import com.example.backupagent.storage.Storage.LocalUploader;
import com.example.backupagent.storage.Storage.S3ObjectStore;
import com.example.backupagent.storage.Storage.S3Uploader;
import com.example.backupagent.storage.Storage;
import com.example.backupagent.storage.Storage.ObjectStore;
import com.example.backupagent.storage.Storage.Uploader;
import com.example.backupagent.storage.Storage.StorageBackend;
import com.example.backupagent.supabase.SupabaseGateway;
import com.example.backupagent.tasks.AgentTaskPoller;
import java.io.Console;
import java.io.IOException;
import java.time.Duration;
import java.util.Optional;
import java.util.Scanner;
import java.util.concurrent.CountDownLatch;
import java.util.logging.Logger;

/**
 * Entrada headless do agente (sem UI). Autentica, registra e inicia o poller de tarefas.
 */
public final class Main {

    private static final Logger LOGGER = Logger.getLogger(Main.class.getName());

    public static void main(String[] args) throws Exception {
        new Main().run();
    }

    public void run() throws Exception {
        AppConfig config = AppConfig.load();
        AuthClient authClient = new AuthClient(config);
        SessionManager sessionManager = new SessionManager(authClient);

        bootstrapSession(sessionManager, config);

        StorageBackend configuredBackend = "local".equalsIgnoreCase(config.storageBackend())
                ? StorageBackend.LOCAL
                : StorageBackend.CLOUD;

        // Nao seguir symlinks para evitar loops de filesystem
        ScanService scanService = new ScanService(true, config.hashAlgorithm(), Integer.MAX_VALUE, false, false);
        DiffPlanner diffPlanner = new DiffPlanner();
        Packager packager = new Packager(config.zstdLevel(), config.hashAlgorithm());
        SupabaseGateway supabase = new SupabaseGateway(config);
        DeviceRegistrationClient registrationClient = new DeviceRegistrationClient(config);
        LocalBackupLocation localBackupLocation = new LocalBackupLocation(config.localStorageDir());

        boolean cloudEnabled = configuredBackend == StorageBackend.CLOUD;
        S3Uploader s3Uploader = cloudEnabled ? new S3Uploader(config) : null;
        S3ObjectStore s3ObjectStore = cloudEnabled ? new S3ObjectStore(config) : null;
        Uploader cloudUploader = cloudEnabled ? s3Uploader : disabledCloudUploader();
        Uploader localUploader = new LocalUploader(localBackupLocation);
        ObjectStore localStore = new LocalObjectStore(localBackupLocation);
        ObjectStore objectStore = cloudEnabled
                ? new Storage.CompositeObjectStore(s3ObjectStore, localStore)
                : localStore;

        BackupCoordinator backupCoordinator = new BackupCoordinator(sessionManager, scanService, diffPlanner, packager, cloudUploader, localUploader, supabase, localBackupLocation::current);
        BackupCatalogService catalogService = new BackupCatalogService(supabase, objectStore);
        RestorePlanner restorePlanner = new RestorePlanner(supabase, objectStore);
        RestoreExecutor restoreExecutor = new RestoreExecutor(objectStore, config.hashAlgorithm());
        RestoreService restoreService = new RestoreService(sessionManager, supabase, restorePlanner, restoreExecutor);

        DeviceRegistrationState registrationState = registrationClient.ensureActivationHandshake(sessionManager.accessToken(), sessionManager.sessionId());
        if (!registrationState.isActivated()) {
            Duration waitForActivation = Duration.ofMinutes(2);
            Duration pollEvery = Duration.ofSeconds(10);
            final String pendingCode = registrationState.activationCode();
            LOGGER.warning(() -> "Agente nao ativado; codigo: " + pendingCode + ". Ative no painel. Aguardando ate " + waitForActivation.getSeconds() + "s.");
            Optional<DeviceRegistrationState> activated = pollActivation(registrationClient, registrationState, waitForActivation, pollEvery);
            if (activated.isEmpty()) {
                LOGGER.warning("Ativacao nao concluida dentro do tempo limite. Encerrando.");
                shutdown(cloudUploader, localUploader, objectStore);
                return;
            }
            registrationState = activated.get();
            LOGGER.info("Ativacao confirmada pelo backend. Prosseguindo com o poller de tarefas.");
        }

        AgentTaskPoller poller = new AgentTaskPoller(sessionManager, backupCoordinator, restoreService, registrationState, localBackupLocation, config, config.deviceApiBaseUrl(), Duration.ofSeconds(15), configuredBackend, cloudEnabled, s3Uploader, s3ObjectStore);
        poller.start();

        CountDownLatch latch = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try { poller.close(); } catch (Exception ignore) {}
            shutdown(cloudUploader, localUploader, objectStore);
            latch.countDown();
        }));

        LOGGER.info("Agente headless iniciado. Polling de tarefas ativado.");
        latch.await();
    }

    private void shutdown(AutoCloseable... closeables) {
        for (AutoCloseable closeable : closeables) {
            if (closeable == null) continue;
            try { closeable.close(); } catch (Exception ignore) {}
        }
    }

    private Uploader disabledCloudUploader() {
        return (container, size, sessionId, backupId, checksum) -> {
            throw new IOException("storage_backend 's3' desabilitado (BACKUP_STORAGE=local)");
        };
    }

    private void bootstrapSession(SessionManager sessionManager, AppConfig config) throws IOException {
        String key = resolveKey(config);
        SessionTokenStore tokenStore = new SessionTokenStore(SessionTokenStore.defaultPath(), key);

        Optional<String> persisted = tokenStore.loadRefreshToken();
        if (persisted.isPresent()) {
            try {
                sessionManager.loginWithRefresh(persisted.get());
                LOGGER.info("Sessao restaurada via refresh token persistido.");
                return;
            } catch (Exception e) {
                LOGGER.warning("Refresh token persistido invalido/caducado; removendo cache local e prosseguindo para novo login. Detalhe: " + e.getMessage());
                try { tokenStore.deleteIfExists(); } catch (IOException ignore) {}
            }
        }

        Optional<String> refresh = Optional.ofNullable(System.getenv("SUPABASE_REFRESH_TOKEN")).filter(s -> !s.isBlank());
        if (refresh.isPresent()) {
            try {
                sessionManager.loginWithRefresh(refresh.get());
                tokenStore.persistRefreshToken(refresh.get());
                LOGGER.info("Sessao criada via refresh token do ambiente.");
                return;
            } catch (Exception e) {
                LOGGER.warning("Refresh token de ambiente rejeitado: " + e.getMessage());
            }
        }

        String email = System.getenv("SUPABASE_EMAIL");
        String password = System.getenv("SUPABASE_PASSWORD");
        if (email == null || password == null || email.isBlank() || password.isBlank()) {
            Console console = System.console();
            if (console != null) {
                email = console.readLine("SUPABASE_EMAIL: ");
                char[] pwdChars = console.readPassword("SUPABASE_PASSWORD: ");
                password = pwdChars != null ? new String(pwdChars) : "";
            } else {
                Scanner scanner = new Scanner(System.in);
                System.out.print("SUPABASE_EMAIL: ");
                email = scanner.nextLine();
                System.out.print("SUPABASE_PASSWORD: ");
                password = scanner.nextLine();
            }
        }
        if (email == null || password == null || email.isBlank() || password.isBlank()) {
            throw new IllegalStateException("Defina SUPABASE_EMAIL/SUPABASE_PASSWORD ou SUPABASE_REFRESH_TOKEN para login headless.");
        }
        var session = sessionManager.login(email, password);
        if (session.refreshToken() != null && !session.refreshToken().isBlank()) {
            tokenStore.persistRefreshToken(session.refreshToken());
        }
    }

    private String resolveKey(AppConfig config) {
        return config.find("KEEPLY_AGENT_KEY")
                .or(() -> Optional.ofNullable(System.getenv("KEEPLY_AGENT_KEY")))
                .orElseThrow(() -> new IllegalStateException("KEEPLY_AGENT_KEY obrigatoria para armazenar sessao (defina no .env do agente ou no ambiente)."));
    }

    /**
     * Polls the backend for activation while the agent remains pending.
     */
    private Optional<DeviceRegistrationState> pollActivation(DeviceRegistrationClient registrationClient,
                                                             DeviceRegistrationState current,
                                                             Duration timeout,
                                                             Duration interval) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadline) {
            try {
                Thread.sleep(interval.toMillis());
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return Optional.empty();
            }

            Optional<DeviceRegistrationState> activated;
            try {
                activated = registrationClient.completeActivationIfPossible(current);
            } catch (IOException e) {
                LOGGER.warning(() -> "Falha ao consultar ativacao: " + e.getMessage());
                continue;
            }
            if (activated.isPresent()) {
                return activated;
            }

            LOGGER.info(() -> "Aguardando ativacao... codigo " + current.activationCode() + " (nova tentativa em " + interval.getSeconds() + "s)");
        }
        return Optional.empty();
    }
}
