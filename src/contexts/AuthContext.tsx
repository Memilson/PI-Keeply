'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import type { User, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AuthState } from '@/types'

interface SignUpOptions {
  displayName?: string
  phone?: string
  username?: string
  cpf?: string
  address?: string
  billing?: {
    cardBrand?: string
    last4?: string
    expMonth?: string
    expYear?: string
    billingPending?: boolean
  }
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string, opts?: SignUpOptions) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Logout via REST (POST /auth/v1/logout) como alternativa/complemento
  const restLogout = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!token || !url || !apikey) return
      await fetch(`${url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey
        }
      })
    } catch {
      // silencioso; método oficial via SDK já cobre 99% dos casos
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!isMounted) return
      setUser(session?.user ?? null)
      setLoading(false)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    return { error }
  }, [])

  const signUp = useCallback(async (email: string, password: string, opts?: SignUpOptions) => {
    setLoading(true)
    // Se o projeto requer confirmação por e-mail, não haverá sessão após signup.
    const displayName = (opts?.displayName && opts.displayName.trim()) || email.split('@')[0]
    const phone = opts?.phone?.trim() || undefined
    const username = opts?.username?.trim() || undefined
    const cpf = opts?.cpf?.trim() || undefined

    const { error } = await supabase.auth.signUp({
      email,
      password,
      // Salva display_name, phone e demais atributos de segurança nos metadados do usuário
      options: {
        data: {
          display_name: displayName,
          phone,
          username,
          cpf,
          address: opts?.address || undefined,
          billing: opts?.billing || undefined
        }
      }
    })

    setLoading(false)
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    setLoading(true)
    // Limpa estado imediatamente para refletir o logout na UI
    setUser(null)
    // Usa escopo global para encerrar todas as sessões do usuário
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    // Melhor esforço: também chama o endpoint REST oficial (sem bloquear a UI)
    restLogout()
    setLoading(false)
    return { error }
  }, [restLogout])

  const resetPassword = useCallback(async (email: string) => {
    // Configure esta URL no Auth > URL de Redirecionamento (ou coloque aqui).
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/update-password`
    })
    return { error }
  }, [])

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut, resetPassword, getAccessToken }),
    [user, loading, signIn, signUp, signOut, resetPassword, getAccessToken]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
