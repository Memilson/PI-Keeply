"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import MarketingPageLayout from "@/components/marketing/UnifiedMarketing"
import { Reveal } from "@/components/UnifiedCommon"
import { CTASection } from "@/components/marketing/Sections"
import { keeplyStyles } from "@/styles/keeply"
import { useAuth } from "@/contexts/AuthContext"

const solutionHighlights = [
  {
    title: "Proteção sem dor de cabeça",
    description:
      "Conecte pastas e dispositivos e deixe o Keeply cuidar do backup automático, com alertas claros quando algo precisa de atenção.",
    icon: (
      <svg className="w-6 h-6 text-[#0067B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  {
    title: "Governança em português claro",
    description:
      "Trilhas de auditoria, quem acessou o quê e por quanto tempo de forma legível, sem painel confuso ou termos técnicos soltos.",
    icon: (
      <svg className="w-6 h-6 text-[#0067B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Fluxos guiados de restore",
    description:
      "Perdeu um arquivo ou trocou de máquina? Siga o passo a passo e restaure só o que mudou, rápido e sem drama.",
    icon: (
      <svg className="w-6 h-6 text-[#0067B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 13l3 3 7-7" />
      </svg>
    ),
  },
]

const industries = [
  {
    name: "Tecnologia",
    description:
      "Backups contínuos dos artefatos e estações, com visibilidade simples para produto, engenharia e suporte.",
  },
  {
    name: "Saúde",
    description:
      "Controle de acesso por função, trilhas de auditoria e relatórios fáceis para atender regulações sem planilha paralela.",
  },
  {
    name: "Finanças",
    description:
      "Retenção ajustável, restores guiados e alertas claros para reduzir risco operacional e responder a auditorias.",
  },
  {
    name: "Educação",
    description:
      "Proteja materiais, trabalhos e documentos sensíveis de alunos e equipes com backup automático e restore rápido.",
  },
]

export default function SolutionsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push("/personal/dashboard")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-slate-200 border-t-[#0067B8]" />
          <span className="text-xs text-slate-500">Carregando sua experiência Keeply...</span>
        </div>
      </div>
    )
  }

  if (user) {
    return null
  }

  return (
    <MarketingPageLayout
      containerClassName="min-h-screen bg-slate-50"
      mainStyle={keeplyStyles.fontFamily}
    >
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-20 w-80 h-80 bg-[#0067B8]/10 rounded-full blur-3xl" />
          <div className="absolute top-10 right-16 w-72 h-72 bg-[#005A9F]/12 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[520px] h-[520px] bg-gradient-to-r from-[#0067B8]/12 via-transparent to-[#38BDF8]/15 rounded-full blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.35) 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
          />
        </div>

        <div className="relative">
          <div className={`${keeplyStyles.layout.container} py-20 md:py-24`}>
            <div className="grid lg:grid-cols-[1.1fr,0.9fr] gap-16 items-center">
              <div className="space-y-8">
                <Reveal>
                  <span className="inline-flex items-center gap-2 bg-white/90 shadow-[0_18px_45px_rgba(148,163,184,0.35)] border border-[#0067B8]/15 text-[#0067B8] text-[11px] sm:text-xs font-semibold px-4 py-2 rounded-full tracking-[0.18em] uppercase">
                    Keeply para equipes
                  </span>
                </Reveal>

                <Reveal delayMs={100}>
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-slate-900 leading-tight tracking-tight">
                    Backup e governança em um só fluxo
                  </h1>
                </Reveal>

                <Reveal delayMs={150}>
                  <p className="text-base md:text-lg text-slate-600 max-w-2xl leading-relaxed">
                    Instale o agente, escolha as pastas e deixe o Keeply rodar. Painéis claros mostram se está tudo salvo e quem acessou o quê, sem jargão ou ruído.
                  </p>
                </Reveal>

                <Reveal delayMs={200}>
                  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-slate-200">
                    {[
                      { label: "Integrações prontas", value: "+120" },
                      { label: "Disponibilidade média", value: "99,9%" },
                      { label: "Suporte humano", value: "24/7" },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <dt className="text-xs text-slate-500 uppercase tracking-wide">
                          {item.label}
                        </dt>
                        <dd className="text-2xl font-semibold text-slate-900">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>

                <Reveal delayMs={240}>
                  <div className="flex flex-wrap gap-3">
                    <a href="/landingPage/register" className={keeplyStyles.button.primary}>
                      Falar com um especialista
                    </a>
                    <a href="/landingPage/pricing" className={keeplyStyles.button.secondary}>
                      Ver planos
                    </a>
                    <a href="/landingPage/recursos" className={keeplyStyles.button.ghost}>
                      Conhecer recursos
                    </a>
                  </div>
                </Reveal>
              </div>

              <Reveal delayMs={200}>
                <div className="relative">
                  <div className="absolute -inset-4 bg-gradient-to-br from-white via-white to-sky-50 rounded-3xl shadow-[0_24px_60px_rgba(148,163,184,0.35)]" />
                  <div className="relative bg-white border border-slate-200 rounded-3xl p-8 space-y-6">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase">Onboarding guiado</p>
                      <p className="text-lg font-semibold text-slate-900">
                        Ambientes prontos em poucos dias, não semanas.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/80 space-y-4">
                      <p className="text-sm font-semibold text-slate-900">O que o Keeply resolve</p>
                      <ul className="space-y-2 text-sm text-slate-600">
                        <li className="flex gap-2 items-start">
                          <span className="mt-1 w-2 h-2 rounded-full bg-[#0067B8]" />
                          Backups automáticos com retenção configurável.
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="mt-1 w-2 h-2 rounded-full bg-[#0067B8]" />
                          Alertas claros por e-mail quando algo falha.
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="mt-1 w-2 h-2 rounded-full bg-[#0067B8]" />
                          Relatórios simples para auditoria e compliance.
                        </li>
                      </ul>
                    </div>

                    <p className="text-sm text-slate-500 italic leading-relaxed">
                      “Com o Keeply, backup e governança ficaram claros para o time inteiro. Sem manual gigante, sem pânico.”
                      <span className="block mt-1 font-semibold text-slate-700">— Laura Martins, CTO</span>
                    </p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* CASOS DE USO */}
      <section className="bg-white">
        <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section} space-y-16`}>
          <Reveal>
            <div className="space-y-4 text-center max-w-3xl mx-auto">
              <span className="text-xs font-semibold tracking-[0.18em] text-[#0067B8] uppercase">
                Casos de uso
              </span>
              <h2 className="text-3xl md:text-4xl font-semibold text-slate-900">
                Como o Keeply funciona na prática
              </h2>
              <p className="text-base md:text-lg text-slate-600">
                De times pequenos a operações maiores, o fluxo é o mesmo: backup automático, visibilidade simples e restauração guiada.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {industries.map((industry, index) => (
              <Reveal key={industry.name} delayMs={index * 120}>
                <div className="relative overflow-hidden border border-slate-200 rounded-2xl bg-white p-8 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(148,163,184,0.35)]">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0067B8] via-[#005A9F] to-[#3B82F6]" />
                  <div className="space-y-4">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#0067B8]/10 text-[#0067B8] text-sm font-semibold">
                      {index + 1}
                    </span>
                    <h3 className="text-xl font-semibold text-slate-900">{industry.name}</h3>
                    <p className="text-sm md:text-base text-slate-600 leading-relaxed">
                      {industry.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* POR QUE KEEPly */}
      <section className="bg-slate-50">
        <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section}`}>
          <Reveal>
            <div className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr] items-center">
              <div className="space-y-6">
                <span className="text-xs font-semibold tracking-[0.18em] text-[#0067B8] uppercase">
                  Por que escolher o Keeply
                </span>
                <h2 className="text-3xl md:text-4xl font-semibold text-slate-900">
                  Backup e governança sem complicar sua rotina
                </h2>
                <p className="text-base md:text-lg text-slate-600">
                  Tudo em português claro, com painéis leves, alertas diretos e fluxos guiados. Menos tempo configurando, mais tempo trabalhando.
                </p>

                <ul className="space-y-4">
                  {solutionHighlights.map((highlight) => (
                    <li key={highlight.title} className="flex items-start gap-4">
                      <div className="mt-1 inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-[#0067B8]/10 text-[#0067B8]">
                        {highlight.icon}
                      </div>
                      <div className="space-y-1">
                        <p className="text-base md:text-lg font-semibold text-slate-900">
                          {highlight.title}
                        </p>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {highlight.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-6">
                <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
                  <p className="text-xs font-semibold text-[#0067B8] uppercase tracking-wide mb-2">
                    Pacote completo
                  </p>
                  <p className="text-xl font-semibold text-slate-900 mb-3">
                    Backup automático, retenção, alertas e relatórios no mesmo lugar.
                  </p>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li>• Playbooks inspirados em LGPD e boas práticas de segurança.</li>
                    <li>• Conecta SSO e identidades sem configurar tudo do zero.</li>
                    <li>• Painéis claros para ver risco, SLA e saúde dos backups.</li>
                  </ul>
                </div>
                <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
                  <p className="text-xs font-semibold text-[#0067B8] uppercase tracking-wide mb-2">
                    Sucesso do cliente
                  </p>
                  <p className="text-sm md:text-base text-slate-600 leading-relaxed">
                    Time humano, em português, para ajudar no desenho da arquitetura e na migração dos primeiros backups.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <CTASection variant="light" />
    </MarketingPageLayout>
  )
}
