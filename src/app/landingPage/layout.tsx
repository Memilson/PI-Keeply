import type { ReactNode } from 'react'

import { LandingNavbar } from './components/LandingNavbar'

export const metadata = {
  title: 'Keeply',
  description: 'Backup e governança simples, em português claro, para o dia a dia.',
}

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LandingNavbar />
      {children}
    </>
  )
}
