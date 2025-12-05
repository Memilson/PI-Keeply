'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/contexts/AuthContext'

interface ProtectedRouteProps {
  children: ReactNode
  redirect?: string
}

export const ProtectedRoute = ({ children, redirect = '/landingPage/login' }: ProtectedRouteProps) => {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace(redirect)
    }
  }, [user, loading, router, redirect])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-sm text-neutral-600">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" aria-hidden />
          <span>Conferindo sua conta...</span>
        </div>
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
