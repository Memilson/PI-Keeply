import Link from 'next/link'
import type { ReactNode } from 'react'

import { ArrowRightIcon } from '@/components/common/Icons'

interface FeatureItem {
  key: string
  title: string
  description: string
  icon: ReactNode
}

interface FeatureGridProps {
  items: FeatureItem[]
}

export function FeatureGrid({ items }: FeatureGridProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {items.map((feature, index) => (
        <div
          key={feature.key}
          className="group relative overflow-hidden border border-[#E5E7EB] rounded-xl bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
          style={{ transitionDelay: `${index * 80}ms` }}
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0067B8] via-[#005A9F] to-[#60A5FA]" />
          <div className="p-7 space-y-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#0067B8]/10 text-[#0067B8] group-hover:bg-[#0067B8]/15 transition-colors">
              {feature.icon}
            </div>
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-[#111827]">{feature.title}</h3>
              <p className="text-sm text-[#4B5563] leading-relaxed">{feature.description}</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0067B8] opacity-0 group-hover:opacity-100 transition-opacity">
              Ver como configurar
              <ArrowRightIcon className="w-4 h-4" strokeWidth={2} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface TierItem {
  title: string
  description: string
  points: string[]
}

interface TierGridProps {
  items: TierItem[]
  actionHref: string
  actionLabel: string
}

export function TierGrid({ items, actionHref, actionLabel }: TierGridProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {items.map((tier, index) => (
        <div
          key={tier.title}
          className="border border-[#E5E7EB] rounded-xl bg-[#F9FAFB] p-8 flex flex-col gap-6 hover:border-[#0067B8] hover:bg-white transition-colors"
          style={{ transitionDelay: `${index * 80}ms` }}
        >
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-[#111827]">{tier.title}</h3>
            <p className="text-sm text-[#4B5563] leading-relaxed">{tier.description}</p>
          </div>
          <ul className="space-y-3 text-sm text-[#4B5563]">
            {tier.points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-1 w-2 h-2 bg-[#0067B8] rounded-full" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <Link
            href={actionHref}
            className="mt-auto inline-flex items-center gap-2 text-xs font-semibold text-[#0067B8] hover:text-[#005A9F] transition-colors"
          >
            {actionLabel}
            <ArrowRightIcon className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
      ))}
    </div>
  )
}
