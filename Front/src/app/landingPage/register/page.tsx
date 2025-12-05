'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/contexts/AuthContext'
import { Accordion, AccordionItem } from '@/components/ui/UnifiedUI'
import MarketingPageLayout from '@/components/marketing/UnifiedMarketing'
import { keeplyStyles } from '@/styles/keeply'
import { formatCPFInput, formatPhoneBRInput } from '@/lib/utils'
import {
  isStrongPassword,
  isValidEmail,
  isValidPhone,
  isValidUsername,
  sanitizeDigits,
} from '@/lib/validators'

function validarCPF(cpf: string): boolean {
  if (!cpf) return false
  const apenasNumeros = cpf.replace(/[^\d]/g, '')
  if (apenasNumeros.length !== 11 || /^(\d)\1{10}$/.test(apenasNumeros)) {
    return false
  }
  try {
    let soma = 0
    for (let i = 0; i < 9; i++) {
      soma += Number(apenasNumeros.charAt(i)) * (10 - i)
    }
    let digito1 = 11 - (soma % 11)
    if (digito1 > 9) digito1 = 0

    soma = 0
    for (let i = 0; i < 10; i++) {
      soma += Number(apenasNumeros.charAt(i)) * (11 - i)
    }
    let digito2 = 11 - (soma % 11)
    if (digito2 > 9) digito2 = 0

    const dv1Informado = Number(apenasNumeros.charAt(9))
    const dv2Informado = Number(apenasNumeros.charAt(10))

    return dv1Informado === digito1 && dv2Informado === digito2
  } catch {
    return false
  }
}

function StatusIcon({ done, disabled }: { done?: boolean; disabled?: boolean }) {
  const base = 'inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold'
  if (disabled) return <span className={base + ' bg-[#e5e7eb] text-[#9ca3af]'}>–</span>
  if (done) return <span className={base + ' bg-[#0067B8] text-white'}>✓</span>
  return <span className={base + ' bg-[#0067B8]/10 text-[#0067B8]'}>•</span>
}

export default function Register() {
  const { user, signUp, loading } = useAuth()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      router.push('/personal/dashboard')
    }
  }, [user, loading, router])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const trimmedName = displayName.trim()
      const normalizedEmail = email.trim().toLowerCase()
      const normalizedUsername = username.trim()
      const normalizedUsernameLookup = normalizedUsername.toLowerCase()
      const sanitizedPhone = sanitizeDigits(phone)
      const sanitizedCpf = sanitizeDigits(cpf)

      if (!trimmedName) {
        setError('Informe seu nome completo.')
        setIsLoading(false)
        return
      }
      if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
        setError('Informe um e-mail válido.')
        setIsLoading(false)
        return
      }
      if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
        setError('Use um nome de usuário entre 3 e 30 caracteres (letras, números ou _).')
        setIsLoading(false)
        return
      }
      if (!isStrongPassword(password, normalizedEmail, trimmedName)) {
        setError(
          'A senha deve ter de 10 a 64 caracteres, incluir maiúsculas, minúsculas, números e símbolos.',
        )
        setIsLoading(false)
        return
      }
      if (password !== confirmPassword) {
        setError('As senhas não coincidem.')
        setIsLoading(false)
        return
      }
      if (!validarCPF(cpf)) {
        setError('Informe um CPF válido.')
        setIsLoading(false)
        return
      }
      if (phone && !isValidPhone(phone)) {
        setError('Informe um telefone válido com DDD.')
        setIsLoading(false)
        return
      }

      const validationResponse = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          username: normalizedUsernameLookup,
          cpf: sanitizedCpf,
          phone: sanitizedPhone || undefined,
        }),
      })

      const validationPayload = await validationResponse.json().catch(() => null)
      if (!validationResponse.ok) {
        const message =
          validationPayload && typeof validationPayload.error === 'string'
            ? validationPayload.error
            : 'Não foi possível validar seus dados. Tente novamente.'
        throw new Error(message)
      }
      if (!validationPayload || typeof validationPayload !== 'object') {
        throw new Error('Resposta inválida ao validar dados do usuário.')
      }

      const availability = validationPayload as {
        emailExists?: boolean
        usernameExists?: boolean
        cpfExists?: boolean
        phoneExists?: boolean
      }

      if (availability.emailExists) {
        setError('Este e-mail já está em uso.')
        setIsLoading(false)
        return
      }
      if (availability.usernameExists) {
        setError('Este nome de usuário já está em uso.')
        setIsLoading(false)
        return
      }
      if (availability.cpfExists) {
        setError('Este CPF já está associado a uma conta.')
        setIsLoading(false)
        return
      }
      if (availability.phoneExists) {
        setError('Este telefone já está associado a uma conta.')
        setIsLoading(false)
        return
      }

      const { error: signUpError } = await signUp(normalizedEmail, password, {
        displayName: trimmedName,
        phone: sanitizedPhone || undefined,
        username: normalizedUsername,
        cpf: sanitizedCpf,
      })

      if (signUpError) {
        const errorMessage = signUpError instanceof Error ? signUpError.message : String(signUpError)
        if (errorMessage.includes('already registered')) {
          setError('Este e-mail já está em uso.')
        } else if (errorMessage.includes('password')) {
          setError('Senha inválida. Confira os requisitos.')
        } else if (errorMessage.includes('email')) {
          setError('E-mail inválido ou já cadastrado.')
        } else {
          setError(`Erro: ${errorMessage}`)
        }
      } else {
        setSuccess(true)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta. Tente novamente.'
      setError(message)
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
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#0067B8] border-t-transparent" />
      </div>
    )
  }

  if (success) {
    return (
      <MarketingPageLayout
        containerClassName="min-h-screen bg-slate-50 text-slate-900"
        containerStyle={keeplyStyles.fontFamily}
        mainClassName="px-6 py-20"
        showFooter={false}
      >
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-sky-50" />
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.25) 1px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
          />
          <div className="absolute -top-32 -left-32 w-72 h-72 bg-blue-200/40 blur-3xl rounded-full" />
          <div className="absolute bottom-[-120px] right-10 w-80 h-80 bg-cyan-200/40 blur-3xl rounded-full" />
          <div className="relative">
            <div className="mx-auto max-w-xl">
              <div className="relative">
                <div className="absolute -top-6 -left-6 -right-6 -bottom-6 bg-gradient-to-br from-white via-white to-[#E6F0FF] rounded-3xl shadow-xl shadow-[#0067B8]/10" />
                <div className="relative rounded-3xl border border-[#E4E4E4] bg-white p-10 text-center shadow-lg">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#0067B8]/10 text-[#0067B8]">
                    <svg
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h1 className="text-2xl font-semibold text-slate-900">Conta criada.</h1>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    Enviamos um e-mail de confirmação. Confirme o endereço para ativar seu acesso ao
                    painel.
                  </p>
                  <Link
                    href="/landingPage/login"
                    className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[#0067B8] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(0,103,184,0.28)] transition hover:bg-[#005A9F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0067B8]"
                  >
                    Ir para login
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </MarketingPageLayout>
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
        {/* Fundo com gradiente + grid sutil, igual outras telas */}
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
            <div className="grid max-w-5xl mx-auto items-start gap-12 lg:grid-cols-[1.1fr,0.95fr]">
              {/* Coluna esquerda – texto / benefícios */}
              <div className="space-y-8">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#0067B8] shadow-sm backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0067B8]" />
                  Registro gratuito
                </span>

                <div className="space-y-4 text-slate-900">
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight tracking-tight">
                    Criar conta Keeply
                  </h1>
                  <p className="max-w-xl text-sm sm:text-base md:text-lg leading-relaxed text-slate-600">
                    Crie sua conta gratuitamente, sem cartão de crédito.
                  </p>
                </div>
              </div>

              {/* Coluna direita – card com formulário */}
              <div className="relative">
                <div className="absolute -top-6 -left-6 -right-6 -bottom-6 bg-gradient-to-br from-white via-white to-[#E6F0FF] rounded-3xl shadow-xl shadow-[#0067B8]/10" />
                <div className="relative rounded-3xl border border-[#E4E4E4] bg-white p-8 md:p-10 shadow-lg space-y-6">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-slate-900">Dados da conta</h2>
                    <p className="text-sm text-slate-600">
                      Preencha as informações principais. Você pode ajustar depois.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                      <div className="rounded-xl border border-[#fca5a5] bg-[#fee2e2] px-4 py-3 text-sm font-medium text-[#b91c1c]">
                        {error}
                      </div>
                    )}

                    <Accordion>
                      <AccordionItem
                        title={
                          <>
                            <StatusIcon
                              done={!!displayName && !!username && !!cpf}
                            />{' '}
                            Perfil e identificação
                          </>
                        }
                        defaultOpen
                      >
                        <div className="grid gap-5 sm:grid-cols-2">
                          <div className="space-y-2 sm:col-span-2">
                            <label
                              htmlFor="displayName"
                              className="text-sm font-semibold text-slate-900"
                            >
                              Nome completo
                            </label>
                            <input
                              id="displayName"
                              type="text"
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#0067B8] focus:outline-none focus:ring-2 focus:ring-[#0067B8]/20"
                              autoComplete="name"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <label
                              htmlFor="username"
                              className="text-sm font-semibold text-slate-900"
                            >
                              Nome de usuário
                            </label>
                            <input
                              id="username"
                              type="text"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#0067B8] focus:outline-none focus:ring-2 focus:ring-[#0067B8]/20"
                              autoComplete="username"
                              required
                            />
                            <p className="text-xs text-slate-500">
                              Use letras, números ou _. Mínimo de 3 caracteres.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="cpf" className="text-sm font-semibold text-slate-900">
                              CPF
                            </label>
                            <input
                              id="cpf"
                              type="text"
                              inputMode="numeric"
                              value={formatCPFInput(cpf)}
                              onChange={(e) => setCpf(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#0067B8] focus:outline-none focus:ring-2 focus:ring-[#0067B8]/20"
                              placeholder="000.000.000-00"
                              required
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <label
                              htmlFor="phone"
                              className="text-sm font-semibold text-slate-900"
                            >
                              Telefone{' '}
                              <span className="font-normal text-slate-500">(opcional)</span>
                            </label>
                            <input
                              id="phone"
                              type="tel"
                              value={formatPhoneBRInput(phone)}
                              onChange={(e) => setPhone(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#0067B8] focus:outline-none focus:ring-2 focus:ring-[#0067B8]/20"
                              placeholder="(11) 91234-5678"
                            />
                          </div>
                        </div>
                      </AccordionItem>

                      <AccordionItem
                        title={
                          <>
                            <StatusIcon
                              done={
                                !!email &&
                                !!password &&
                                !!confirmPassword &&
                                password === confirmPassword
                              }
                            />{' '}
                            Credenciais de acesso
                          </>
                        }
                      >
                        <div className="grid gap-5">
                          <div className="space-y-2">
                            <label
                              htmlFor="email"
                              className="text-sm font-semibold text-slate-900"
                            >
                              Email
                            </label>
                            <input
                              id="email"
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#0067B8] focus:outline-none focus:ring-2 focus:ring-[#0067B8]/20"
                              placeholder="seu@email.com"
                              autoComplete="email"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <label
                              htmlFor="password"
                              className="text-sm font-semibold text-slate-900"
                            >
                              Senha
                            </label>
                            <input
                              id="password"
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#0067B8] focus:outline-none focus:ring-2 focus:ring-[#0067B8]/20"
                              autoComplete="new-password"
                              required
                            />
                            <ul className="space-y-1 text-xs text-slate-500">
                              <li>• De 10 a 64 caracteres, sem espaços.</li>
                              <li>• Inclua maiúsculas, minúsculas, números e símbolos.</li>
                            </ul>
                          </div>
                          <div className="space-y-2">
                            <label
                              htmlFor="confirmPassword"
                              className="text-sm font-semibold text-slate-900"
                            >
                              Confirmar senha
                            </label>
                            <input
                              id="confirmPassword"
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#0067B8] focus:outline-none focus:ring-2 focus:ring-[#0067B8]/20"
                              autoComplete="new-password"
                              required
                            />
                          </div>
                        </div>
                      </AccordionItem>
                    </Accordion>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0067B8] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(0,103,184,0.28)] transition hover:bg-[#005A9F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0067B8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? 'Criando conta...' : 'Registrar'}
                    </button>

                    <p className="text-xs text-slate-500 text-center">
                      Sem cartão de crédito, sem fidelidade. Cancele quando quiser.
                    </p>
                  </form>

                  <div className="pt-4 border-t border-slate-200 space-y-3 text-sm text-slate-600">
                    <p>
                      Já tem uma conta?{' '}
                      <Link
                        href="/landingPage/login"
                        className="font-semibold text-[#0067B8] transition hover:text-[#005A9F]"
                      >
                        Fazer login
                      </Link>
                    </p>
                    <Link
                      href="/landingPage/landing"
                      className="inline-flex items-center gap-1 text-slate-500 transition hover:text-slate-900"
                    >
                      <span aria-hidden>←</span> Voltar para o site
                    </Link>
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
