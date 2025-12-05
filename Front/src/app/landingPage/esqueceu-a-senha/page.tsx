"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"

import { supabase } from "@/lib/supabase"

type Status = "idle" | "loading" | "success" | "error"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!email || !isValidEmail(email)) {
      setErrorMessage("Digite um e-mail válido para continuar.")
      setStatus("error")
      return
    }

    setStatus("loading")
    setErrorMessage("")

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/landingPage/reset-password`,
      })

      if (error) {
        console.error("Erro ao enviar e-mail de recuperação:", error.message)
        setErrorMessage("Não conseguimos enviar o e-mail. Tente novamente.")
        setStatus("error")
        return
      }

      setStatus("success")
    } catch (error) {
      console.error(error)
      setErrorMessage("Algo deu errado. Por favor, tente novamente.")
      setStatus("error")
    }
  }

  const isSubmitting = status === "loading"

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
            Recuperar senha
          </h1>
          <p className="mt-2 text-sm text-[#737373]">
            Enviaremos um link seguro para você criar uma nova senha.
          </p>
        </div>

        <div className="bg-white shadow-[0_18px_45px_rgba(148,163,184,0.18)] border border-slate-200 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-[#1B1B1B] mb-2"
              >
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[#1B1B1B] placeholder:text-[#737373] shadow-sm focus:outline-none focus:border-[#0067B8] focus:ring-2 focus:ring-[#0067B8]/20 transition-colors"
                placeholder="seu@email.com"
              />
            </div>

            {status === "error" && errorMessage && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                <svg
                  className="inline w-4 h-4 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
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
                <svg
                  className="inline w-4 h-4 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Link enviado! Confira seu e-mail para continuar.
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-[#0067B8] text-white font-semibold rounded-full hover:bg-[#005A9F] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0067B8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-[0_12px_30px_rgba(0,103,184,0.18)]"
            >
              {isSubmitting ? "Enviando..." : "Enviar link de recuperação"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/landingPage/login"
              className="inline-flex items-center gap-1 text-sm text-[#0067B8] hover:underline font-semibold"
            >
              <span aria-hidden>←</span> Voltar para o login
            </Link>
          </div>
        </div>

        <div className="text-center text-xs text-[#737373]">
          <p>Não recebeu o e-mail? Verifique a caixa de spam.</p>
        </div>
      </div>
    </div>
  )
}
