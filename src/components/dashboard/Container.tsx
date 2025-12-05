"use client"

import type { ReactNode } from 'react'

export interface DashboardContainerProps {
  children: ReactNode
  className?: string
}

export function DashboardContainer({ children, className }: DashboardContainerProps) {
  return (
    <div
      className={`min-h-screen bg-[#F3F3F3] ${className ?? ''}`.trim()}
      style={{ fontFamily: 'Segoe UI, system-ui, sans-serif' }}
    >

      {children}
    </div>
  )
}

export default DashboardContainer
