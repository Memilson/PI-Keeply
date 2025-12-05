'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Reveal } from '@/components/UnifiedCommon'
import { LandingFooter } from '@/components/marketing/UnifiedMarketing'
import { MarketingHero, FeatureCards, CTASection } from '@/components/marketing/Sections'
import { useAuth } from '@/contexts/AuthContext'
import { keeplyStyles } from '@/styles/keeply'

const dashboardHighlights = [
  { metric: 'Backups completos', value: '87', trend: 'últimos 30 dias' },
  { metric: 'Dispositivos protegidos', value: '2', trend: 'Notebook e PC de casa' },
  { metric: 'Tempo médio de restauração', value: '2 min', trend: 'para um arquivo' },
]

const backupOptions = [
  {
    title: 'Backup automático na nuvem Keeply',
    description:
      'Guarde seus arquivos importantes na nuvem da Keeply e tenha acesso mesmo se algo acontecer com o computador.',
    points: ['Versões por 30 dias', 'Criptografia em trânsito e em repouso', 'Alertas claros se algo falhar'],
  },
  {
    title: 'Nuvem + disco externo',
    description:
      'Combine nuvem e HD externo: uma cópia perto de você e outra segura na nuvem para qualquer imprevisto.',
    points: ['Cópia local rápida', 'Envio que não trava a internet', 'Reaproveita o que já foi enviado'],
  },
  {
    title: 'Modo viagem e internet limitada',
    description:
      'Usando 4G ou rede ruim? Limite banda, pause envios grandes e retome do ponto certo.',
    points: ['Controle de banda', 'Pause e retome fácil', 'Continua de onde parou'],
  },
]

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    )
  }

  if (user) return null

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="px-0 pb-16">
        <MarketingHero
          eyebrow="Keeply Pessoal — Backup leve e tranquilo"
          title="Suas memórias protegidas enquanto você vive a vida"
          description="Fotos de família, trabalhos da faculdade, documentos importantes. O Keeply faz o backup em segundo plano e avisa se algo precisar da sua atenção."
          primaryCta={{ label: 'Começar backup grátis', href: '/landingPage/register' }}
          secondaryCta={{ label: 'Ver como funciona', href: '/landingPage/faq' }}
          helper="Roda em segundo plano — Windows, Mac e Linux — Sem precisar ser da área de TI"
          sideContent={<HeroVisual />}
        />

        <section className="bg-white border-t border-slate-200">
          <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section} space-y-12`} style={keeplyStyles.fontFamily}>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <Reveal>
                <div className="space-y-4 max-w-2xl">
                  <span className="text-xs sm:text-sm font-semibold tracking-[0.18em] text-blue-500 uppercase">
                    Feito para a rotina real
                  </span>
                  <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                    Protege o que você guarda no PC, sem complicar
                  </h2>
                  <p className="text-sm md:text-base text-slate-600">
                    Seja para estudar, trabalhar ou guardar memórias, o Keeply foi pensado para garantir que, se der ruim, os arquivos estão seguros.
                  </p>
                </div>
              </Reveal>

              <Reveal delayMs={100}>
                <Link
                  href="/landingPage/recursos"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:border-blue-400 hover:text-blue-600 transition-colors shadow-sm"
                >
                  Ver recursos em detalhes
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </Reveal>
            </div>
            <FeatureCards />
          </div>
        </section>

        <DashboardShowcase />
        <BackupOptions />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  )
}

function DashboardShowcase() {
  return (
    <section className="bg-slate-50">
      <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section}`} style={keeplyStyles.fontFamily}>
        <div className="grid lg:grid-cols-[1.1fr,0.9fr] gap-10 items-center">
          <Reveal>
            <div className="space-y-6">
              <span className="text-xs sm:text-sm font-semibold tracking-[0.18em] text-blue-500 uppercase">
                Painel para gente comum
              </span>
              <h2 className="text-3xl md:text-4xl font-semibold text-slate-900">Veja em segundos se está tudo salvo</h2>
              <p className="text-sm md:text-base text-slate-600 leading-relaxed">
                Um painel simples mostra quanto já foi enviado, quais pastas estão protegidas e se tem algo precisando de atenção. Sem termos complicados.
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                {dashboardHighlights.map((item) => (
                  <div key={item.metric} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-[11px] text-slate-500">{item.metric}</p>
                    <p className="text-2xl font-semibold text-slate-900 mt-2">{item.value}</p>
                    <p className="text-[11px] font-medium text-blue-600 mt-3">{item.trend}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-4 text-[11px] sm:text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                  Monitoramento em tempo real
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                  Alertas por e-mail quando algo falha
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-sky-500 rounded-full" />
                  Sugestões para proteger novas pastas
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={150}>
            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-to-br from-blue-100/80 via-white to-sky-100 rounded-3xl blur-3xl" />
              <div className="relative bg-white rounded-3xl overflow-hidden shadow-[0_22px_70px_rgba(148,163,184,0.45)] border border-slate-200">
                <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/80">
                  <span className="text-sm font-medium text-slate-900">Keeply — Painel pessoal</span>
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="w-2 h-2 rounded-full bg-amber-300" />
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                  </div>
                </div>
                <div className="w-full bg-slate-50 p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <SmallCard label="Último backup" value="Há 2 horas" status="Tudo certo" />
                    <SmallCard label="Dispositivos protegidos" value="3 de 5" status="2 para ativar" />
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900 mb-3">Pastas protegidas recentemente</div>
                    <div className="space-y-2">
                      {['Fotos da família', 'Documentos pessoais', 'Projetos da faculdade'].map((name, i) => (
                        <div
                          key={name}
                          className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                              <div className="w-4 h-4 rounded-lg bg-blue-400/80" />
                            </div>
                            <span className="text-sm text-slate-800">{name}</span>
                          </div>
                          <span className="text-[11px] text-slate-500">{i === 0 ? 'Hoje' : 'Ontem'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function BackupOptions() {
  return (
    <section className="bg-white border-t border-slate-200">
      <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section} space-y-12`} style={keeplyStyles.fontFamily}>
        <Reveal>
          <div className="space-y-4 max-w-2xl">
            <span className="text-xs sm:text-sm font-semibold tracking-[0.18em] text-blue-500 uppercase">
              Para o jeito que você usa o computador
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
              Escolha como quer guardar seus arquivos
            </h2>
            <p className="text-sm md:text-base text-slate-600">
              Você não precisa ser especialista em nuvem. Só define como quer guardar, ativa o modo desejado e acompanha tudo pelo painel.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {backupOptions.map((tier, index) => (
            <Reveal key={tier.title} delayMs={index * 120}>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-7 flex flex-col gap-5 hover:border-blue-400/60 hover:bg-white transition-colors shadow-[0_18px_40px_rgba(148,163,184,0.35)]">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900">{tier.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{tier.description}</p>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  {tier.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <span className="mt-1 w-2 h-2 bg-blue-500 rounded-full" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/landingPage/solucoes"
                  className="mt-auto inline-flex items-center gap-2 text-[11px] font-semibold text-blue-600 hover:text-sky-600 transition-colors"
                >
                  Ver detalhes
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function HeroVisual() {
  return (
    <div className="relative">
      <div className="absolute -inset-5 bg-gradient-to-br from-blue-200/70 via-white to-emerald-100/70 blur-3xl rounded-[32px]" />
      <div className="relative rounded-[28px] border border-slate-200 bg-white/90 backdrop-blur-xl shadow-[0_22px_70px_rgba(148,163,184,0.45)] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500">Seu computador, sempre em dia</p>
            <p className="text-sm sm:text-base font-medium text-slate-900">Resumo do backup</p>
          </div>
          <span className="px-3 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
            Tudo sincronizado
          </span>
        </div>

        <div className="w-full bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 rounded-[24px] space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-2">
            <StatCard label="Backups realizados" value="247" helper="Desde que você instalou" color="text-blue-600" />
            <StatCard label="Fotos e vídeos" value="824 GB" helper="Memórias protegidas" color="text-emerald-600" />
            <StatCard label="Taxa de sucesso" value="99,8%" helper="Tarefas concluídas" color="text-indigo-600" />
          </div>

          <div className="rounded-2xl bg-white border border-slate-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-slate-900">Atividade dos últimos 7 dias</div>
              <span className="text-[11px] text-slate-500">Sem falhas críticas</span>
            </div>
            <div className="flex items-end justify-between gap-2 h-28">
              {[85, 92, 78, 95, 88, 91, 97].map((height, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-xl bg-gradient-to-t from-blue-500 to-sky-400"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-2">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-3 text-[11px] text-slate-600">
          <Tag text="Backups diários automáticos" color="bg-indigo-50 text-indigo-700" dot="bg-indigo-500" />
          <Tag text="Aviso se algo falhar" color="bg-sky-50 text-sky-700" dot="bg-sky-400" />
          <Tag text="Restauração guiada em poucos cliques" color="bg-amber-50 text-amber-700" dot="bg-amber-400" />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  helper,
  color,
}: {
  label: string
  value: string
  helper: string
  color: string
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3 shadow-sm">
      <div className="text-[11px] text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <p className="text-[10px] text-slate-500 mt-1">{helper}</p>
    </div>
  )
}

function Tag({ text, color, dot }: { text: string; color: string; dot: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  )
}

function SmallCard({ label, value, status }: { label: string; value: string; status: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
      <div className="text-[11px] text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-[11px] text-emerald-600">{status}</span>
      </div>
    </div>
  )
}
