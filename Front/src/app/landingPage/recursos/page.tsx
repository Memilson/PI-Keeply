'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import MarketingPageLayout from '@/components/marketing/UnifiedMarketing'
import { Reveal } from '@/components/UnifiedCommon'
import { CTASection } from '@/components/marketing/Sections'
import { keeplyStyles } from '@/styles/keeply'
import { useAuth } from '@/contexts/AuthContext'

const CORE_CAPABILITIES = [
  {
    title: 'Backup em um só lugar',
    description:
      'Proteja computadores e servidores usando as mesmas regras. Tudo aparece em um painel simples.',
    bullets: ['Funciona local e na nuvem', 'Regras reaproveitáveis para vários dispositivos', 'Status em uma só tela'],
  },
  {
    title: 'Automático e inteligente',
    description:
      'Defina horários e retenção e o Keeply cuida do resto. Novos dispositivos já herdam as configurações certas.',
    bullets: ['Escolha quando enviar cada tipo de arquivo', 'Novos dispositivos entram prontos', 'Alertas claros quando algo falha'],
  },
  {
    title: 'Controle do histórico',
    description:
      'Veja quando cada backup foi feito, quem restaurou e por quê. Útil para auditorias e para corrigir incidentes.',
    bullets: ['Histórico completo de ações', 'Relatórios fáceis de compartilhar', 'Exportação simples para análises'],
  },
]

const PROTECTION_LAYERS = [
  {
    category: 'Proteção e retenção',
    items: [
      'Backups completos e incrementais',
      'Retenção ajustável por tipo de dado',
      'Políticas específicas para workloads críticos',
    ],
  },
  {
    category: 'Segurança e conformidade',
    items: [
      'Criptografia em trânsito e em repouso',
      'Acesso por papéis (RBAC) para times e clientes',
      'Trilhas de auditoria para backup e restore',
    ],
  },
  {
    category: 'Recuperação rápida',
    items: [
      'Assistente guiado para restaurar arquivos',
      'Teste de restauração sem afetar produção',
      'Tempo estimado para recuperar cada item',
    ],
  },
]

const MSP_FEATURES = [
  {
    title: 'Gerencie várias contas',
    description: 'Administre clientes ou equipes no mesmo painel, cada um com suas permissões.',
    detail: 'Ideal para quem presta serviço de backup para terceiros.',
  },
  {
    title: 'Modelos prontos',
    description: 'Crie uma configuração uma vez e aplique em novas contas em poucos cliques.',
    detail: 'Menos retrabalho na hora de embarcar novos clientes.',
  },
  {
    title: 'Custos claros',
    description: 'Veja espaço usado e custo estimado por cliente, pasta ou política.',
    detail: 'Fica fácil explicar o valor do serviço para cada conta.',
  },
]

const INTEGRATIONS = [
  'Suites de produtividade e colaboração',
  'Diretórios e identidades corporativas',
  'Plataformas de observabilidade e monitoramento',
  'Outros provedores de backup ou storage',
]

export default function RecursosPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push('/personal/dashboard')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
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
      <CapabilitiesSection />
      <ProtectionSection />
      <MspSection />
      <IntegrationsSection />
      <CTASection variant="light" />
    </MarketingPageLayout>
  )
}

function HeroSection() {
  return (
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
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-200/40 blur-3xl rounded-full" />
      <div className="absolute top-10 right-0 w-72 h-72 bg-cyan-200/40 blur-3xl rounded-full" />
      <div className="absolute bottom-[-120px] left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-blue-100/60 blur-3xl rounded-full" />

      <div className="relative">
        <div className={`${keeplyStyles.layout.container} pt-6 pb-20`}>
          <div className="grid lg:grid-cols-[1.1fr,0.95fr] items-center gap-12 lg:gap-16">
            <div className="space-y-7">
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-4 py-1.5 text-[11px] sm:text-xs font-medium text-blue-700 shadow-sm backdrop-blur">
                  <span className="h-4 w-1 rounded-full bg-gradient-to-b from-blue-500 to-sky-400" />
                  Recursos da plataforma Keeply
                </span>
              </Reveal>

              <Reveal delayMs={100}>
                <h1 className="text-3xl md:text-5xl lg:text-[3.2rem] font-semibold text-slate-950 leading-tight tracking-tight">
                  Backup, governança e visibilidade no mesmo fluxo
                </h1>
              </Reveal>

              <Reveal delayMs={150}>
                <p className="text-sm md:text-base text-slate-600 max-w-xl leading-relaxed">
                  O Keeply padroniza como sua organização protege, monitora e restaura dados, sem painéis confusos ou manual gigante.
                </p>
              </Reveal>

              <Reveal delayMs={200}>
                <div className="flex flex-col sm:flex-row gap-4">
                  <a
                    href="/landingPage/register"
                    className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-[#0067B8] text-white text-sm md:text-base font-semibold shadow-[0_18px_45px_rgba(0,103,184,0.28)] hover:bg-[#005A9F] transition-transform transform hover:-translate-y-0.5"
                  >
                    Explorar na prática
                  </a>
                  <a
                    href="/landingPage/pricing"
                    className="inline-flex items-center justify-center px-7 py-3.5 rounded-full border border-slate-200 text-slate-800 text-sm md:text-base font-medium bg-white/80 backdrop-blur hover:border-blue-400 hover:text-blue-700 transition-colors"
                  >
                    Ver planos e preços
                  </a>
                </div>
              </Reveal>
            </div>

            {/* Antes tinha o card "Fluxo do Keeply" aqui; foi removido */}
          </div>
        </div>
      </div>
    </section>
  )
}

function CapabilitiesSection() {
  return (
    <section className="bg-white border-t border-slate-200">
      <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section} space-y-12`}>
        <Reveal>
          <div className="space-y-4 text-center">
            <span className="text-xs sm:text-sm font-semibold tracking-[0.18em] text-blue-500 uppercase">
              O que o Keeply faz por você
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
              Recursos pensados para times de infraestrutura e segurança
            </h2>
            <p className="text-sm md:text-base text-slate-600 max-w-3xl mx-auto">
              De políticas de backup a relatórios de governança, tudo para reduzir trabalho manual e ganhar previsibilidade.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {CORE_CAPABILITIES.map((cap, index) => (
            <Reveal key={cap.title} delayMs={index * 120}>
              <div className="h-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-[0_20px_50px_rgba(100,116,139,0.15)] hover:-translate-y-1 transition-all">
                <h3 className="text-xl font-semibold text-slate-900 mb-3">{cap.title}</h3>
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">{cap.description}</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  {cap.bullets.map((b) => (
                    <li key={b} className="flex gap-2 items-start">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProtectionSection() {
  return (
    <section className="bg-slate-50">
      <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section}`}>
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr] items-start">
            <div className="space-y-6">
              <span className="text-xs sm:text-sm font-semibold tracking-[0.18em] text-blue-500 uppercase">
                Camadas de proteção
              </span>
              <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">Da política ao restore, monitorado o tempo todo</h2>
              <p className="text-sm md:text-base text-slate-600">
                Responda "o que está protegido?", "por quanto tempo?" e "em quanto tempo consigo restaurar?" sem usar múltiplas ferramentas.
              </p>
              <p className="text-sm text-slate-600">
                Você acompanha o ciclo completo de proteção de dados, com foco em confiabilidade, segurança e clareza para o time inteiro.
              </p>
            </div>

            <div className="grid gap-4">
              {PROTECTION_LAYERS.map((layer) => (
                <div key={layer.category} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                  <p className="text-sm text-blue-600 font-semibold mb-2">{layer.category}</p>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {layer.items.map((i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function MspSection() {
  return (
    <section className="bg-white border-t border-slate-200">
      <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section} space-y-12`}>
        <Reveal>
          <div className="space-y-4 text-center">
            <span className="text-xs sm:text-sm font-semibold tracking-[0.18em] text-blue-500 uppercase">
              Para quem é o Keeply
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
              Feito para equipes de TI e quem gerencia backups de vários clientes
            </h2>
            <p className="text-sm md:text-base text-slate-600 max-w-3xl mx-auto">
              Recursos que equilibram profundidade técnica com uma experiência simples para apresentar resultados à gestão.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {MSP_FEATURES.map((f, index) => (
            <Reveal key={f.title} delayMs={index * 120}>
              <div className="h-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-[0_20px_50px_rgba(100,116,139,0.15)] hover:-translate-y-1 transition-all">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-600 mb-3 leading-relaxed">{f.description}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{f.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function IntegrationsSection() {
  return (
    <section className="bg-slate-50">
      <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section}`}>
        <Reveal>
          <div className="flex flex-col lg:flex-row items-start justify-between gap-10 rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
            <div className="space-y-4 max-w-xl">
              <span className="text-xs sm:text-sm font-semibold tracking-[0.18em] text-blue-500 uppercase">
                Ecossistema
              </span>
              <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">Conectado ao que você já usa</h2>
              <p className="text-sm md:text-base text-slate-600">
                O Keeply funciona junto com suas ferramentas atuais, centralizando o gerenciamento dos backups.
              </p>
              <p className="text-sm text-slate-600">
                Você não precisa trocar tudo de uma vez. Adicione o Keeply e mantenha seu histórico de backups.
              </p>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Exemplos de integrações suportadas
              </p>
              <ul className="space-y-2 text-sm text-slate-600">
                {INTEGRATIONS.map((item) => (
                  <li key={item} className="flex gap-2 items-start">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">
                A lista cresce conforme a demanda de clientes e parceiros. Recursos avançados podem ser expostos via API para automações específicas.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
