'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { faqItems, marketingLinks } from '@/content/nav'
import { useAuth } from '@/contexts/AuthContext'

export function LandingNavbar() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  const isActive = (href: string): boolean => {
    if (href === '/landingPage/landing') {
      return pathname === '/' || pathname.startsWith('/landingPage/landing')
    }
    return pathname.startsWith(href)
  }

  const handleSignOut = async () => {
    const { error } = await signOut()
    if (!error) {
      router.replace('/landingPage/login')
    }
  }

  const linkBase =
    'px-3 py-2 text-sm font-medium rounded-full transition-colors duration-150'
  const activeLink = 'text-[#0F172A] bg-[#E8F2FB]'
  const idleLink =
    'text-[#475569] hover:text-[#0B5CAB] hover:bg-[#E8F2FB]'

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/landingPage/landing"
            className="flex items-baseline gap-2"
            aria-label="Keeply Home"
          >
            <span className="text-xl font-semibold text-[#0F172A]">
              Keeply
            </span>
            <span className="hidden text-xs font-medium uppercase tracking-[0.16em] text-[#64748B] sm:inline">
              Proteja o que importa
            </span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {marketingLinks.map((link) => {
              const active = isActive(link.href)
              const highlight = link.emphasis ? 'font-semibold' : ''

              if (link.children) {
                return (
                  <div key={link.label} className="group relative">
                    <Link
                      href={link.href}
                      className={`${linkBase} ${highlight} ${
                        active ? activeLink : idleLink
                      }`}
                    >
                      {link.label}
                      <svg
                        className="ml-1.5 inline h-3 w-3 translate-y-px"
                        viewBox="0 0 20 20"
                        fill="none"
                      >
                        <path
                          d="M6 8l4 4 4-4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Link>
                    <div className="invisible absolute left-0 mt-3 w-56 rounded-2xl border border-slate-200 bg-white/98 p-3 opacity-0 shadow-[0_18px_45px_rgba(148,163,184,0.22)] backdrop-blur transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                      {faqItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="block rounded-xl px-3 py-2 text-sm text-[#475569] transition-colors hover:bg-[#E8F2FB] hover:text-[#0B5CAB]"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              }

              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`${linkBase} ${highlight} ${
                    active ? activeLink : idleLink
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <>
                <Link
                  href="/personal/files"
                  className="inline-flex items-center justify-center rounded-full border border-[#0067B8]/50 px-5 py-2.5 text-sm font-semibold text-[#0B5CAB] transition-all hover:border-[#0067B8] hover:bg-[#E8F2FB]"
                >
                  Ir para meus arquivos
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center justify-center rounded-full bg-[#0067B8] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_35px_rgba(0,103,184,0.15)] transition-all hover:bg-[#005A9F]"
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/landingPage/login"
                  className="inline-flex items-center justify-center rounded-full border border-transparent px-5 py-2.5 text-sm font-semibold text-[#0B5CAB] transition-all hover:border-[#0067B8]/60 hover:bg-[#E8F2FB]"
                >
                  Entrar
                </Link>
                <Link
                  href="/landingPage/register"
                  className="inline-flex items-center justify-center rounded-full bg-[#0067B8] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_35px_rgba(0,103,184,0.15)] transition-all hover:bg-[#005A9F]"
                >
                  Criar minha conta
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-[#0F172A] transition-colors hover:border-[#0067B8] hover:text-[#0067B8] lg:hidden"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Abrir menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className={`lg:hidden ${isMobileMenuOpen ? 'block' : 'hidden'}`}>
        <div className="border-t border-slate-200 bg-white/95 shadow-[0_18px_45px_rgba(148,163,184,0.22)] backdrop-blur">
          <div className="flex flex-col gap-1 px-4 py-4">
            {marketingLinks.map((link) => (
              <div key={link.label}>
                <Link
                  href={link.href}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
                    isActive(link.href)
                      ? 'bg-[#E8F2FB] text-[#0F172A]'
                      : 'text-[#475569] hover:bg-[#E8F2FB] hover:text-[#0B5CAB]'
                  }`}
                >
                  <span>{link.label}</span>
                  {link.children ? (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M6 8l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </Link>
                {link.children ? (
                  <div className="mt-1 space-y-1 pl-4">
                    {link.children.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block rounded-xl px-3 py-2 text-sm text-[#475569] transition-colors hover:bg-[#E8F2FB] hover:text-[#0B5CAB]"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            {user ? (
              <div className="flex flex-col gap-2">
                <Link
                  href="/personal/files"
                  className="inline-flex items-center justify-center rounded-full border border-[#0067B8]/50 px-5 py-2.5 text-sm font-semibold text-[#0B5CAB]"
                >
                  Ir para meus arquivos
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center justify-center rounded-full bg-[#0067B8] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_35px_rgba(0,103,184,0.15)]"
                >
                  Sair
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/landingPage/login"
                  className="inline-flex items-center justify-center rounded-full border border-transparent px-5 py-2.5 text-sm font-semibold text-[#0B5CAB] hover:border-[#0067B8]/60 hover:bg-[#E8F2FB]"
                >
                  Entrar
                </Link>
                <Link
                  href="/landingPage/register"
                  className="inline-flex items-center justify-center rounded-full bg-[#0067B8] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_35px_rgba(0,103,184,0.15)]"
                >
                  Criar minha conta
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
