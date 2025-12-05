import type { ReactNode } from 'react'

import { DashboardNavbar } from '@/components/UnifiedCommon'

export const metadata = {
  title: 'Keeply | Area pessoal',
  description: 'Acompanhe backups, arquivos e dispositivos em um só lugar, sem complicar.',
}

export default function PersonalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardNavbar />
      {children}
    </>
  )
}
