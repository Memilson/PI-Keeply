'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import MarketingPageLayout from '@/components/marketing/UnifiedMarketing'
import { Reveal } from '@/components/UnifiedCommon'
import { CTASection } from '@/components/marketing/Sections'
import { keeplyStyles } from '@/styles/keeply'
import { useAuth } from '@/contexts/AuthContext'

type PricingTier = {
  name: string
  price: string
  description: string
  note: string
  features: string[]
  cta: string
  highlight?: boolean
}

const pricingTiers: PricingTier[] = [
  {
    name: 'Por dispositivo',
    price: 'R$ 7,90 / dispositivo / mês',
    description:
      'Ideal para ambientes com muitos computadores, servidores e VMs. Você enxerga exatamente quanto cada máquina custa no mês.',
    note: 'Cobre cada computador, servidor ou VM protegida.',
    features: [
      'Proteja computadores, servidores e máquinas virtuais',
      'Backups locais e em nuvem com configuração simples',
      'Painel com status por dispositivo e alertas automáticos',
      'Cálculo de custo por máquina para repasse MSP',
    ],
    cta: 'Ver plano por dispositivo',
    highlight: true,
  },
  {
    name: 'Armazenamento em nuvem por GB',
    price: 'R$ 0,89 / GB / mês',
    description:
      'Pool de armazenamento em nuvem criptografado para dados críticos, retenções longas e requisitos de compliance.',
    note: 'Cobrança por volume armazenado, com consolidação mensal.',
    features: [
      'Storage em nuvem com criptografia ponta a ponta',
      'Retenção longa para arquivamento e compliance',
      'Object lock e imutabilidade contra ransomware',
      'Relatórios de uso por cliente, pasta e política',
    ],
    cta: 'Calcular por GB em nuvem',
  },
  {
    name: 'Plano Profissional',
    price: 'Sob consulta',
    description:
      'Combina proteção por dispositivo com armazenamento por GB. Pensado para quem gerencia muitos clientes ou áreas internas.',
    note: 'Descontos progressivos por volume de agentes e storage.',
    features: [
      'Preço customizado por dispositivo e por GB',
      'Modelos prontos para repassar custos para clientes',
      'Faturamento consolidado por áreas, filiais ou clientes',
      'Suporte dedicado para desenho do modelo e migração',
    ],
    cta: 'Falar com especialista',
  },
]

const guarantees = [
  {
    title: 'Cobrança flexível',
    description:
      'Workloads, GBs ou modelo híbrido. Você escolhe como repassar o custo para cada cliente, sem quebrar a cabeça em planilha.',
  },
  {
    title: 'Migração assistida',
    description:
      'Especialistas acompanham importação de backups existentes, testes de restauração e ajuste das políticas iniciais.',
  },
  {
    title: 'Transparência total',
    description:
      'Consumo, risco e status em tempo real, em um painel único. Nada de “caixa preta” de storage.',
  },
]

export default function Pricing() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#0067B8] border-t-transparent" />
      </div>
    )
  }

  if (user) return null

  return (
    <MarketingPageLayout
      containerClassName="min-h-screen bg-slate-50"
      mainStyle={keeplyStyles.fontFamily}
    >
      <HeroSection />
      <PricingSection />
      <BenefitsSection />
    </MarketingPageLayout>
  )
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-slate-50">
      {/* fundo decorativo */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-sky-50" />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.25) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-200/40 blur-3xl rounded-full" />
      <div className="absolute top-10 right-0 w-72 h-72 bg-cyan-200/40 blur-3xl rounded-full" />
      <div className="absolute bottom-[-120px] left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-blue-100/60 blur-3xl rounded-full" />

      <div className="relative">
        <div className={`${keeplyStyles.layout.container} pt-6 pb-20`}>
          <div className="grid lg:grid-cols-[1.1fr,0.95fr] items-center gap-12 lg:gap-16">
            {/* Texto principal */}
            <div className="space-y-7">
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-4 py-1.5 text-[11px] sm:text-xs font-medium text-blue-700 shadow-sm backdrop-blur">
                  <span className="h-4 w-1 rounded-full bg-gradient-to-b from-blue-500 to-sky-400" />
                  Modelo MSP Keeply
                </span>
              </Reveal>

              <Reveal delayMs={100}>
                <h1 className="text-3xl md:text-5xl lg:text-[3.2rem] font-semibold text-slate-950 leading-tight tracking-tight">
                  Precificação por dispositivo e por GB, sem matemática maluca
                </h1>
              </Reveal>

              <Reveal delayMs={150}>
                <p className="text-sm md:text-base text-slate-600 max-w-xl leading-relaxed">
                  Combine licenciamento por workload com armazenamento em nuvem.
                  Tenha clareza de custo por agente e por volume de dados, pronto
                  para repassar em modelo MSP.
                </p>
              </Reveal>

              <Reveal delayMs={200}>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-6 border-t border-slate-200">
                  {[
                    { label: 'Teste gratuito', value: '14 dias' },
                    { label: 'Disponibilidade', value: '99,95%' },
                    { label: 'Clientes ativos', value: '2,5k+' },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <dt className="text-sm text-slate-600">{item.label}</dt>
                      <dd className="text-2xl font-semibold text-slate-950">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>

              <Reveal delayMs={250}>
                <div className="flex flex-col sm:flex-row gap-4">
                  <a
                    href="/landingPage/register"
                    className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-[#0067B8] text-white text-sm md:text-base font-semibold shadow-[0_18px_45px_rgba(0,103,184,0.28)] hover:bg-[#005A9F] transition-transform transform hover:-translate-y-0.5"
                  >
                    Começar avaliação gratuita
                  </a>
                  <a
                    href="/landingPage/faq"
                    className="inline-flex items-center justify-center px-7 py-3.5 rounded-full border border-slate-200 text-slate-800 text-sm md:text-base font-medium bg-white/80 backdrop-blur hover:border-blue-400 hover:text-blue-700 transition-colors"
                  >
                    Ver perguntas frequentes
                  </a>
                </div>
              </Reveal>
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="bg-white border-t border-slate-200">
      <div
        className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section} space-y-12`}
      >
        <Reveal>
          <div className="space-y-4 text-center max-w-3xl mx-auto">
            <span className="text-xs sm:text-sm font-semibold tracking-[0.18em] text-blue-500 uppercase">
              Estruture sua oferta
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
              Workloads, GBs ou modelo híbrido, na mesma matriz de preços
            </h2>
            <p className="text-sm md:text-base text-slate-600">
              Defina quanto cobrar por dispositivo protegido e por armazenamento
              em nuvem. Monte planos diferentes para cada cliente sem perder o
              controle da base.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pricingTiers.map((tier, index) => (
            <Reveal key={tier.name} delayMs={index * 120}>
              <div
                className={`relative h-full rounded-3xl border bg-white p-8 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_28px_60px_rgba(100,116,139,0.18)] ${
                  tier.highlight
                    ? 'border-blue-300 shadow-[0_24px_55px_rgba(37,99,235,0.2)]'
                    : 'border-slate-200 shadow-sm'
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-sky-500 text-white text-[11px] font-semibold tracking-[0.12em] px-4 py-1.5 rounded-full shadow-md">
                    Modelo principal
                  </span>
                )}

                <div className="space-y-5">
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-slate-900">
                      {tier.name}
                    </h3>
                    <p className="text-3xl font-bold text-slate-950">
                      {tier.price}
                    </p>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    {tier.description}
                  </p>

                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                    {tier.note}
                  </p>

                  <ul className="space-y-3 text-sm text-slate-600 pt-5 border-t border-slate-200">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href="/landingPage/register"
                  className={`mt-8 inline-flex w-full items-center justify-center px-6 py-3.5 font-semibold rounded-full transition-all ${
                    tier.highlight
                      ? 'bg-[#0067B8] text-white shadow-[0_12px_30px_rgba(0,103,184,0.25)] hover:bg-[#005A9F] hover:shadow-[0_16px_40px_rgba(0,103,184,0.3)]'
                      : 'border border-slate-200 text-slate-800 bg-white hover:border-blue-300 hover:text-blue-700'
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function BenefitsSection() {
  return (
    <section className="bg-slate-50">
      <div
        className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section}`}
      >
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr] items-center">
            <div className="space-y-6">
              <span className="text-xs sm:text-sm font-semibold tracking-[0.18em] text-blue-500 uppercase">
                Benefícios incluídos
              </span>
              <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">
                O que vem junto, independente do modelo
              </h2>
              <p className="text-sm md:text-base text-slate-600">
                Não importa se você licencia por dispositivo, por GB ou híbrido:
                a base é a mesma. Visual unificado, segurança avançada e
                governança pensada para MSP.
              </p>
              <ul className="space-y-3 text-sm text-slate-600">
                <li>• Dashboards responsivos com visão por cliente e por site.</li>
                <li>• Criptografia ponta a ponta e trilhas de auditoria completas.</li>
                <li>
                  • Integrações com suites de produtividade, IAM e ferramentas de
                  suporte.
                </li>
                <li>• Suporte em português e base de conhecimento prática.</li>
              </ul>
            </div>

            <div className="grid gap-4">
              {guarantees.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <p className="text-sm font-semibold text-blue-600 mb-2">
                    {item.title}
                  </p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
