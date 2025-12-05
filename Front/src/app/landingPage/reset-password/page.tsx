"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Status = "idle" | "loading" | "success" | "error" | "recovery-ready";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatus("recovery-ready");
        // Mantém a sessão temporária APENAS para permitir updateUser
        // Mas garante que usuário não navegue autenticado
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!password || password.length < 6) {
      setErrorMessage("A senha deve ter pelo menos 6 caracteres.");
      setStatus("error");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("As senhas não coincidem.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        console.error("Erro ao atualizar senha:", error.message);
        setErrorMessage("Não foi possível atualizar a senha. Tente novamente.");
        setStatus("error");
        return;
      }

      setStatus("success");

      // Faz logout IMEDIATAMENTE após salvar a senha
      // Isso garante que o usuário não fique autenticado sem ter feito login
      await supabase.auth.signOut();

      // Redireciona para login após 1.5s
      setTimeout(() => {
        router.push("/landingPage/login");
      }, 1500);
    } catch (error) {
      console.error(error);
      setErrorMessage("Algo deu errado. Por favor, tente novamente.");
      setStatus("error");
    }
  };

  const isSubmitting = status === "loading";

  const showInvalidLinkScreen =
    status !== "recovery-ready" && status !== "loading" && status !== "success" && status !== "error";

  if (showInvalidLinkScreen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <p
              className="text-xs font-semibold tracking-[0.18em] text-[#0067B8] uppercase mb-2"
              style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
            >
              Keeply
            </p>
            <h1
              className="text-3xl font-bold text-[#1B1B1B]"
              style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
            >
              Link inválido
            </h1>
            <p className="mt-2 text-sm text-[#737373]">Este link de recuperação não é válido ou já expirou.</p>
          </div>

          <div className="bg-white shadow-[0_18px_45px_rgba(148,163,184,0.18)] border border-slate-200 rounded-2xl p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-[#737373] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-[#525252] mb-6">Solicite um novo link de recuperação de senha.</p>
            <a
              href="/landingPage/esqueceu-a-senha"
              className="inline-flex items-center justify-center px-6 py-3 bg-[#0067B8] text-white font-semibold rounded-full hover:bg-[#005A9F] transition-colors duration-200 shadow-[0_12px_30px_rgba(0,103,184,0.18)]"
            >
              Solicitar novo link
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <p
            className="text-xs font-semibold tracking-[0.18em] text-[#0067B8] uppercase mb-2"
            style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
          >
            Keeply
          </p>
          <h1
            className="text-3xl font-bold text-[#1B1B1B]"
            style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
          >
            Nova senha
          </h1>
          <p className="mt-2 text-sm text-[#737373]">Crie uma senha forte e fácil de lembrar.</p>
        </div>

        <div className="bg-white shadow-[0_18px_45px_rgba(148,163,184,0.18)] border border-slate-200 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-[#1B1B1B] mb-2">
                Nova senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[#1B1B1B] placeholder:text-[#737373] shadow-sm focus:outline-none focus:border-[#0067B8] focus:ring-2 focus:ring-[#0067B8]/20 transition-colors"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-[#1B1B1B] mb-2">
                Confirmar senha
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[#1B1B1B] placeholder:text-[#737373] shadow-sm focus:outline-none focus:border-[#0067B8] focus:ring-2 focus:ring-[#0067B8]/20 transition-colors"
                placeholder="Digite a senha novamente"
              />
            </div>

            {status === "error" && errorMessage && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                <svg className="inline w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                {errorMessage}
              </div>
            )}

            {status === "success" && (
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                <svg className="inline w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Senha alterada com sucesso! Redirecionando...
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-[#0067B8] text-white font-semibold rounded-full hover:bg-[#005A9F] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0067B8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-[0_12px_30px_rgba(0,103,184,0.18)]"
            >
              {isSubmitting ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a
              href="/landingPage/login"
              className="inline-flex items-center gap-1 text-sm text-[#0067B8] hover:underline font-semibold"
            >
              <span aria-hidden>←</span> Voltar para o login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
