"use client"

import type { ReactNode } from 'react'

export interface DashboardHeaderProps {
  badge?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  alignment?: 'left' | 'center'
  children?: ReactNode
  className?: string
}

export function DashboardHeader({
  badge,
  title,
  description,
  actions,
  alignment = 'left',
  children,
  className,
}: DashboardHeaderProps) {
  const isCenter = alignment === 'center'

  return (
    <section className={`bg-white border-b border-gray-200 ${className ?? ''}`.trim()}>
      <div className="max-w-7xl mx-auto px-6 py-12">
        {isCenter ? (
          <div className="space-y-6 text-center">
            {badge && <div className="flex justify-center">{badge}</div>}
            <div className="space-y-4">
              {title}
              {description}
            </div>
            {actions && <div className="flex justify-center">{actions}</div>}
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-4">
              {badge}
              {title}
              {description}
            </div>
            {actions && <div className="mt-4 lg:mt-0 lg:flex lg:justify-end">{actions}</div>}
          </div>
        )}

        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  )
}

export default DashboardHeader
