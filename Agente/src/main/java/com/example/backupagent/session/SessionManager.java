package com.example.backupagent.session;

import com.example.backupagent.auth.AuthClient;
import com.example.backupagent.auth.AuthClient.AuthSession;
import java.io.IOException;
import java.util.Objects;
import java.util.Optional;

/**
 * Gerencia a sessão autenticada de forma exclusivamente volátil.
 * Nenhum dado é persistido em disco; apenas a instância ativa mantém
 * tokens na memória durante o ciclo de vida da aplicação.
 *
 * Responsabilidade:
 *  - expor operações de login/logout em alto nível,
 *  - fornecer access token sempre que possível, renovando via refresh_token,
 *  - falhar de forma previsível quando não houver sessão válida.
 */
public final class SessionManager {

    private final AuthClient authClient;
    private final Object refreshLock = new Object();

    public SessionManager(AuthClient authClient) {
        this.authClient = Objects.requireNonNull(authClient, "authClient");
    }

    /**
     * Autentica o usuário e registra a sessão ativa.
     * A sessão é mantida em memória dentro do AuthClient.
     */
    public AuthSession login(String email, String password) throws IOException {
        return authClient.login(email, password);
    }

    /**
     * Inicializa sessão usando um refresh token diretamente (útil para modo headless).
     */
    public AuthSession loginWithRefresh(String refreshToken) throws IOException {
        return authClient.refresh(refreshToken);
    }

    /**
     * Retorna a sessão atual, se existir (independente de estar expirada ou não).
     */
    public Optional<AuthSession> session() {
        return authClient.currentSession();
    }

    /**
     * Indica se existe uma sessão ativa não expirada.
     */
    public boolean hasActiveSession() {
        return authClient.currentSession()
                .filter(s -> !s.isExpired())
                .isPresent();
    }

    /**
     * Limpa qualquer sessão em memória.
     */
    public void logout() {
        authClient.clear();
    }

    /**
     * Retorna o ID do usuário da sessão atual ou lança IllegalStateException
     * se não houver sessão.
     */
    public String sessionId() {
        return requireSession().userId();
    }

    /**
     * Recupera um access token válido.
     *
     * - Se o token atual não estiver expirado, apenas retorna.
     * - Se estiver expirado, tenta realizar refresh com exclusão mútua.
     * - Se não houver sessão ou não for possível fazer refresh, lança
     *   IllegalStateException ou IOException (para falhas remotas).
     */
    public String accessToken() throws IOException {
        AuthSession s = requireSession();
        if (!s.isExpired()) {
            return s.accessToken();
        }

        // Double-check locking para evitar refresh concorrente desnecessário
        synchronized (refreshLock) {
            AuthSession current = requireSession();
            if (current.isExpired()) {
                current = refresh(current);
            }
            return current.accessToken();
        }
    }

    /**
     * Retorna uma sessão obrigatória (pode estar expirada).
     *
     * @throws IllegalStateException se não houver sessão em memória
     */
    public AuthSession requireSession() {
        return authClient.currentSession()
                .orElseThrow(() -> new IllegalStateException("Nenhuma sessão ativa"));
    }

    /**
     * Tenta renovar a sessão usando o refresh token.
     * Se não houver refresh token, limpa a sessão e falha com IllegalStateException.
     */
    private AuthSession refresh(AuthSession session) throws IOException {
        String refreshToken = session.refreshToken();
        if (refreshToken == null || refreshToken.isBlank()) {
            logout();
            throw new IllegalStateException("Sessão expirada sem refresh token disponível");
        }
        try {
            return authClient.refresh(refreshToken);
        } catch (IOException e) {
            // Em caso de falha remota, limpe a sessão para evitar estado zumbi
            logout();
            throw e;
        }
    }
}
