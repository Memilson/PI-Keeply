"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { featureHighlights, heroMetrics, ctaContent } from "@/content/marketing"
import { keeplyStyles } from "@/styles/keeply"

type Metric = { label: string; value: string }

interface MarketingHeroProps {
  eyebrow?: string
  title: string
  description: string
  primaryCta: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  helper?: string
  stats?: Metric[]
  sideContent?: ReactNode
}

export function MarketingHero({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  helper,
  stats = heroMetrics,
  sideContent,
}: MarketingHeroProps) {
  return (
    <section className="relative overflow-hidden">
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
        <div className={`${keeplyStyles.layout.container} pt-6 pb-20`} style={keeplyStyles.fontFamily}>
          <div className="grid lg:grid-cols-[1.1fr,0.95fr] items-center gap-12 lg:gap-16">
            <div className="space-y-7">
              {eyebrow ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-4 py-1.5 text-[11px] sm:text-xs font-medium text-blue-700 shadow-sm backdrop-blur">
                  <span className="h-4 w-1 rounded-full bg-gradient-to-b from-blue-500 to-sky-400" />
                  {eyebrow}
                </span>
              ) : null}

              <h1 className="text-3xl md:text-5xl lg:text-[3.2rem] font-semibold text-slate-950 leading-tight tracking-tight">
                {title}
              </h1>

              <p className="text-sm md:text-base text-slate-600 max-w-xl leading-relaxed">{description}</p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href={primaryCta.href}
                  className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-[#0067B8] text-white text-sm md:text-base font-semibold shadow-[0_18px_45px_rgba(0,103,184,0.28)] hover:bg-[#005A9F] transition-transform transform hover:-translate-y-0.5"
                >
                  {primaryCta.label}
                </Link>
                {secondaryCta ? (
                  <Link
                    href={secondaryCta.href}
                    className="inline-flex items-center justify-center px-7 py-3.5 rounded-full border border-slate-200 text-slate-800 text-sm md:text-base font-medium bg-white/80 backdrop-blur hover:border-blue-400 hover:text-blue-700 transition-colors"
                  >
                    {secondaryCta.label}
                  </Link>
                ) : null}
              </div>

              {stats?.length ? (
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-6 border-t border-slate-200">
                  {stats.map((item) => (
                    <div key={item.label} className="space-y-1">
                      <dt className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{item.label}</dt>
                      <dd className="text-2xl font-semibold text-slate-900">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {helper ? <p className="text-[11px] text-slate-500 pt-2">{helper}</p> : null}
            </div>

            {sideContent ? <div className="relative">{sideContent}</div> : null}
          </div>
        </div>
      </div>
    </section>
  )
}

export function MetricsGrid({ items = heroMetrics }: { items?: Metric[] }) {
  if (!items?.length) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition"
        >
          <dt className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{item.label}</dt>
          <dd className="text-2xl font-semibold text-slate-900 mt-1">{item.value}</dd>
        </div>
      ))}
    </div>
  )
}

export function FeatureCards({ items = featureHighlights }: { items?: typeof featureHighlights }) {
  if (!items?.length) return null
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {items.map((feature, index) => (
        <div
          key={feature.key ?? feature.title}
          className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50/80 via-white to-white shadow-[0_18px_45px_rgba(148,163,184,0.35)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(148,163,184,0.55)]"
          style={{ animationDelay: `${index * 80}ms` }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-blue-400 via-sky-400 to-emerald-400 opacity-60" />
          <div className="p-7 space-y-4 relative z-10">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 shadow-sm">
              <div className="w-5 h-5 rounded-lg bg-blue-500/80" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Ver detalhes
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface CTASectionProps {
  eyebrow?: string
  title?: string
  description?: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  helper?: string
  variant?: "gradient" | "light"
}

export function CTASection({
  eyebrow = ctaContent.eyebrow,
  title = ctaContent.title,
  description = ctaContent.description,
  primaryCta = ctaContent.primaryCta,
  secondaryCta = ctaContent.secondaryCta,
  helper = ctaContent.helper,
  variant = "gradient",
}: CTASectionProps) {
  const isGradient = variant === "gradient"
  return (
    <section className="relative overflow-hidden">
      <div
        className={`absolute inset-0 ${
          isGradient
            ? "bg-gradient-to-br from-blue-500 via-sky-400 to-emerald-400"
            : "bg-white"
        }`}
      />
      {isGradient ? (
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
      ) : null}
      <div className="relative">
        <div className={`${keeplyStyles.layout.container} ${keeplyStyles.layout.section} py-16`} style={keeplyStyles.fontFamily}>
          <div className="max-w-3xl space-y-6 text-slate-900">
            {eyebrow ? (
              <span
                className={`text-xs sm:text-sm font-semibold tracking-[0.18em] uppercase ${
                  isGradient ? "text-slate-100/90" : "text-slate-900/80"
                }`}
              >
                {eyebrow}
              </span>
            ) : null}
            <h2 className={`text-3xl md:text-4xl font-semibold tracking-tight ${isGradient ? "text-slate-50" : "text-slate-900"}`}>
              {title}
            </h2>
            <p className={`text-sm md:text-base leading-relaxed ${isGradient ? "text-slate-50/90" : "text-slate-700"}`}>
              {description}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              {primaryCta ? (
                <Link
                  href={primaryCta.href}
                  className={`inline-flex items-center justify-center px-7 py-3.5 font-semibold text-sm md:text-base rounded-full ${
                    isGradient
                      ? "bg-slate-950 text-slate-50 shadow-[0_22px_70px_rgba(15,23,42,0.6)] hover:bg-slate-900"
                      : "bg-[#0067B8] text-white shadow-[0_18px_45px_rgba(0,103,184,0.28)] hover:bg-[#005A9F]"
                  } transition-colors`}
                >
                  {primaryCta.label}
                </Link>
              ) : null}
              {secondaryCta ? (
                <Link
                  href={secondaryCta.href}
                  className={`inline-flex items-center justify-center px-7 py-3.5 font-semibold text-sm md:text-base rounded-full ${
                    isGradient
                      ? "border border-slate-50/40 text-slate-50 bg-white/10 hover:bg-white/20"
                      : "border border-slate-200 text-slate-800 bg-white hover:border-blue-300"
                  } transition-colors`}
                >
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
            {helper ? (
              <p className={`text-[11px] pt-2 ${isGradient ? "text-slate-50/85" : "text-slate-500"}`}>{helper}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
