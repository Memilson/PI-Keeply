'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/contexts/AuthContext'
import MarketingPageLayout from '@/components/marketing/UnifiedMarketing'
import { keeplyStyles } from '@/styles/keeply'

export default function Login() {
  const { user, signIn, loading } = useAuth()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      router.push('/personal/dashboard')
    }
  }, [user, loading, router])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const trimmedPassword = password.trim()

      if (!normalizedEmail || !trimmedPassword) {
        setError('Preencha e-mail e senha para continuar.')
        setIsLoading(false)
        return
      }

      const { error } = await signIn(normalizedEmail, trimmedPassword)
      if (error) {
        setError('E-mail ou senha incorretos.')
      }
    } catch {
      setError('Não foi possível entrar. Tente novamente em instantes.')
    } finally {
      setIsLoading(false)
    }
  }

  if (loading || user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-50"
        style={keeplyStyles.fontFamily}
      >
        <div
          className="h-10 w-10 rounded-full border-2 border-[#0067B8] border-t-transparent animate-spin"
          aria-label="Carregando"
        />
      </div>
    )
  }

  return (
    <MarketingPageLayout
      containerClassName="min-h-screen bg-slate-50 text-slate-900"
      containerStyle={keeplyStyles.fontFamily}
      mainClassName="px-0"
      showFooter={false}
    >
      <section className="relative overflow-hidden">
        {/* Fundo com gradiente + grid sutil, igual às outras telas */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-sky-50" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.25) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-200/40 blur-3xl rounded-full" />
        <div className="absolute top-10 right-0 w-72 h-72 bg-cyan-200/40 blur-3xl rounded-full" />
        <div className="absolute bottom-[-120px] left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-blue-100/60 blur-3xl rounded-full" />

        <div className="relative">
          <div className={`${keeplyStyles.layout.container} py-6`}>
            <div className="mx-auto grid max-w-5xl items-start gap-10 lg:gap-12 lg:grid-cols-[1.1fr,0.95fr]">
              {/* Coluna direita – card de login */}
              <div className="order-1 lg:order-2 relative">
                <div className="absolute -top-6 -left-6 -right-6 -bottom-6 bg-gradient-to-br from-white via-white to-[#E6F0FF] rounded-3xl shadow-xl shadow-[#0067B8]/10" />
                <div className="relative rounded-3xl border border-[#E4E4E4] bg-white p-6 md:p-8 shadow-lg space-y-6">
                  <div className="mb-2 space-y-1.5">
                    <h2 className="text-xl md:text-2xl font-semibold text-slate-900">
                      Entrar na minha conta
                    </h2>
                    <p className="text-xs md:text-sm text-slate-600">
                      Use seu e-mail e senha para acessar backups e dispositivos.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
                    {error && (
                      <div
                        className="rounded-xl border border-[#fca5a5] bg-[#fee2e2] px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm font-medium text-[#b91c1c]"
                        role="alert"
                        aria-live="polite"
                      >
                        {error}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label
                        htmlFor="email"
                        className="block text-xs sm:text-sm font-semibold text-slate-900"
                      >
                        E-mail
                      </label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seuemail@exemplo.com"
                        aria-describedby="email-help"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-[#0067B8] focus:outline-none focus:ring-2 focus:ring-[#0067B8]/20"
                        required
                      />
                      <p id="email-help" className="mt-1 text-xs text-slate-500">
                        O mesmo e-mail usado quando você criou sua conta.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="password"
                          className="block text-xs sm:text-sm font-semibold text-slate-900"
                        >
                          Senha
                        </label>
                        <Link
                          href="/landingPage/esqueceu-a-senha"
                          className="text-[11px] sm:text-xs font-semibold text-[#0067B8] hover:text-[#005A9F]"
                        >
                          Esqueci minha senha
                        </Link>
                      </div>
                      <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Sua senha"
                        aria-describedby="password-help"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-[#0067B8] focus:outline-none focus:ring-2 focus:ring-[#0067B8]/20"
                        required
                      />
                      <p id="password-help" className="mt-1 text-xs text-slate-500">
                        Não compartilhe sua senha.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      aria-label="Entrar na conta"
                      aria-busy={isLoading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0067B8] px-4 py-2.5 md:py-3 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(0,103,184,0.26)] transition hover:bg-[#005A9F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0067B8] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isLoading ? (
                        <>
                          <span className="h-4 w-4 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
                          Entrando...
                        </>
                      ) : (
                        'Entrar'
                      )}
                    </button>
                  </form>

                  <div className="mt-4 space-y-2 text-xs sm:text-sm text-slate-600">
                    <p>
                      Ainda não tem conta?{' '}
                      <Link
                        href="/landingPage/register"
                        className="font-semibold text-[#0067B8] transition hover:text-[#005A9F]"
                      >
                        Criar conta
                      </Link>
                      <span className="text-slate-500"> — grátis e sem compromisso.</span>
                    </p>
                    <Link
                      href="/landingPage/landing"
                      className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-slate-500 transition hover:text-slate-900"
                    >
                      <span aria-hidden>←</span> Voltar para o site
                    </Link>
                  </div>
                </div>
              </div>

              {/* Coluna esquerda – texto / benefícios */}
              <div className="order-2 lg:order-1 space-y-6">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0067B8] shadow-sm backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0067B8]" />
                  Acesso à sua conta Keeply
                </span>

                <div className="space-y-3 text-slate-900">
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight">
                    Bem-vindo de volta
                  </h1>
                  <p className="max-w-xl text-sm md:text-base leading-relaxed text-slate-600">
                    Acompanhe seus backups e dispositivos em um só lugar.
                  </p>
                </div>

                <div className="hidden md:block">
                  <div className="rounded-2xl border border-dashed border-[#dbe2f3] bg-white/80 px-4 py-3 text-xs md:text-sm text-slate-600 backdrop-blur">
                    <span className="font-semibold text-[#0067B8]">Novo por aqui?</span>{' '}
                    Crie sua conta gratuitamente na página de{' '}
                    <Link
                      href="/landingPage/register"
                      className="font-semibold text-[#0067B8] hover:text-[#005A9F]"
                    >
                      registro
                    </Link>
                    .
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageLayout>
  )
}
