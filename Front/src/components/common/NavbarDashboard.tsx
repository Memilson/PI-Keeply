'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AuthError, User } from '@supabase/supabase-js'

type SignOutHandler = () => Promise<{ error: AuthError | null }>

const DASHBOARD_LINKS: Array<{ label: string; href: string }> = [
  { label: 'Resumo', href: '/personal/dashboard' },
  { label: 'Painel', href: '/personal/panel' },
  { label: 'Meus arquivos', href: '/personal/files' },
  { label: 'Dispositivos', href: '/personal/devices' },
  { label: 'Registrar', href: '/personal/devices/register' },
]

interface NavbarDashboardProps {
  user: User | null
  signOut: SignOutHandler
}

export function NavbarDashboard({ user, signOut }: NavbarDashboardProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)

  if (!user) return null

  const isActive = (path: string): string =>
    pathname === path
      ? 'bg-[#005A9F] text-white'
      : 'text-[#737373] hover:text-[#0067B8] hover:bg-[#F8F9FA]'

  const getDisplayName = (): string => {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>
    return (
      (typeof meta.display_name === 'string' && meta.display_name) ||
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      user.email?.split('@')[0] ||
      'Usuário'
    )
  }

  const getInitials = (): string =>
    getDisplayName()
      .split(' ')
      .map((segment) => segment[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/personal/dashboard" className="flex items-center space-x-3">
              <span className="text-xl font-semibold text-[#1B1B1B]">Keeply</span>
            </Link>

            <div className="hidden items-center space-x-1 md:flex">
              {DASHBOARD_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-sm px-4 py-2 font-medium transition-all duration-200 ${isActive(link.href)}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="relative">
              <button
                onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                className="flex items-center space-x-3 rounded-sm p-2 transition-colors hover:bg-[#F8F9FA]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0067B8] text-sm font-medium text-white">
                  {getInitials()}
                </div>
                <div className="hidden flex-col items-start md:flex">
                  <span className="text-sm font-medium text-[#1B1B1B]">{getDisplayName()}</span>
                  <span className="text-xs text-[#737373]">{user.email}</span>
                </div>
                <svg
                  className={`h-4 w-4 text-[#737373] transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 z-50 mt-2 w-64 rounded-sm border border-gray-200 bg-white shadow-lg">
                  <div className="py-2">
                    <Link
                      href="/personal/files"
                      className="flex items-center px-4 py-2 text-sm text-[#737373] transition-colors hover:bg-[#F8F9FA] hover:text-[#0067B8]"
                      onClick={() => setIsProfileMenuOpen(false)}
                    >
                      <svg className="mr-3 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      Meus Arquivos
                    </Link>

                    <div className="my-2 border-t border-gray-100" />

                    <button
                      onClick={async () => {
                        setIsProfileMenuOpen(false)
                        const { error } = await signOut()
                        if (!error) router.replace('/landingPage/login')
                      }}
                      className="flex w-full items-center px-4 py-2 text-sm text-[#737373] transition-colors hover:bg-[#F8F9FA] hover:text-[#0067B8]"
                    >
                      <svg className="mr-3 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      Sair
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 md:hidden">
          <div className="flex space-x-1 py-2">
            {DASHBOARD_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex-1 rounded-sm px-3 py-2 text-center text-sm font-medium transition-all duration-200 ${isActive(
                  link.href
                )}`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
