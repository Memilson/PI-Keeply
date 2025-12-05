"use client"

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/UnifiedUI'

export function LandingFooter() {
  return (
    <footer className="px-4 py-10 border-t border-slate-200 text-slate-700 bg-white/95 backdrop-blur">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <h4 className="text-slate-900 font-semibold mb-3">Produto</h4>
          <ul className="space-y-1 text-sm">
            <li>
              <Link href="/landingPage/landing" className="hover:text-[#0067B8]">
                Visão geral
              </Link>
            </li>
            <li>
              <Link href="/landingPage/recursos" className="hover:text-[#0067B8]">
                Recursos
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-slate-900 font-semibold mb-3">Explorar</h4>
          <ul className="space-y-1 text-sm">
            <li>
              <Link href="/landingPage/solucoes" className="hover:text-[#0067B8]">
                Soluções
              </Link>
            </li>
            <li>
              <Link href="/landingPage/pricing" className="hover:text-[#0067B8]">
                Planos e preços
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-slate-900 font-semibold mb-3">Legal</h4>
          <ul className="space-y-1 text-sm">
            <li>
              <button className="hover:text-[#0067B8]" type="button">
                Privacidade
              </button>
            </li>
            <li>
              <button className="hover:text-[#0067B8]" type="button">
                Termos
              </button>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-slate-900 font-semibold mb-3">Assine</h4>
          <p className="text-sm mb-2">
            Receba novidades curtas sobre como manter seus backups em dia
          </p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-50 px-4 py-2.5 rounded-full border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0067B8] focus:border-[#0067B8]"
              placeholder="seu@email.com"
              aria-label="E-mail para assinar novidades"
            />
            <Button className="px-4 py-2.5 text-sm rounded-full">Assinar</Button>
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-8 text-xs text-slate-500">
        © {new Date().getFullYear()} Keeply. Backup e governança sem complicação para pessoas e equipes.
      </div>
    </footer>
  )
}

interface MarketingPageLayoutProps {
  children: ReactNode
  containerClassName?: string
  containerStyle?: CSSProperties
  mainClassName?: string
  mainStyle?: CSSProperties
  showFooter?: boolean
}

export function MarketingPageLayout({
  children,
  containerClassName = 'min-h-screen bg-slate-50',
  containerStyle,
  mainClassName = 'px-0 pb-16',
  mainStyle,
  showFooter = true,
}: MarketingPageLayoutProps) {
  return (
    <div className={containerClassName} style={containerStyle}>
      <main className={mainClassName} style={mainStyle}>
        {children}
      </main>
      {showFooter ? <LandingFooter /> : null}
    </div>
  )
}

export default MarketingPageLayout
