import type { ReactNode } from 'react'

interface AuthShellProps {
  title: string
  subtitle: string
  description: string
  highlights: Array<{ title: string; description: string }>
  children: ReactNode
  footer?: ReactNode
  badge?: string
}

export function AuthShell({ title, subtitle, description, highlights, children, footer, badge }: AuthShellProps) {
  return (
    <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-[1.1fr,1fr] min-h-[540px] bg-white border border-[#E4E4E4] rounded-md shadow-2xl overflow-hidden">
      <div className="relative bg-gradient-to-br from-[#0B5CAB] via-[#0067B8] to-[#2563EB] text-white p-10 flex flex-col gap-10">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="absolute -bottom-20 -right-24 w-72 h-72 bg-[#93C5FD]/40 rounded-full blur-3xl" />
        <div className="relative space-y-4 max-w-xl">
          {badge ? (
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/15 border border-white/30 text-xs font-semibold uppercase tracking-wide rounded-sm">
              <span className="w-1 h-5 bg-white/80" />
              {badge}
            </span>
          ) : null}
          <h2 className="text-3xl lg:text-4xl font-semibold leading-snug">{title}</h2>
          <p className="text-white/80 text-lg leading-relaxed">{subtitle}</p>
        </div>

        <dl className="relative grid gap-6 sm:grid-cols-2">
          {highlights.map((item) => (
            <div key={item.title} className="bg-white/10 border border-white/20 rounded-md p-4">
              <dt className="text-sm font-semibold text-white/90">{item.title}</dt>
              <dd className="text-sm text-white/70 mt-2 leading-relaxed">{item.description}</dd>
            </div>
          ))}
        </dl>

        <p className="relative text-sm text-white/60 leading-relaxed">
          {description}
        </p>
      </div>

      <div className="relative p-8 sm:p-10 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-[#1B1B1B]">{title}</h1>
            <p className="text-[#525252] leading-relaxed">{subtitle}</p>
          </div>
          <div className="space-y-5">{children}</div>
        </div>
        {footer ? <div className="mt-10 pt-6 border-t border-[#E4E4E4]">{footer}</div> : null}
      </div>
    </div>
  )
}

export function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F6F9]">
      <div
        className="h-12 w-12 rounded-full border-2 border-[#1F4BFF] border-t-transparent animate-spin"
        aria-label="Carregando"
      />
    </div>
  )
}
