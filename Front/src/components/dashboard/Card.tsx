"use client"

import type { ReactNode, HTMLAttributes } from 'react'
import { keeplyStyles } from '@/styles/keeply'

export interface DashboardCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function DashboardCard({ children, className, ...rest }: DashboardCardProps) {
  return (
    <div className={`${keeplyStyles.card.base} ${className ?? ''}`.trim()} {...rest}>
      {children}
    </div>
  )
}

export default DashboardCard
