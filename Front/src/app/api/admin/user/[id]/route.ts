import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export async function GET(req: Request) {
  try {
    // Defense-in-depth: também valida header aqui (além do middleware)
    const secret = process.env.ADMIN_API_SECRET
    const provided = req.headers.get('x-admin-secret')
    if (!secret || !provided || provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient()
  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const id = segments[segments.length - 1]
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    }

    // Tenta obter usuário pelo admin SDK
    if (typeof supabase.auth.admin?.getUserById === 'function') {
      const { data, error } = await supabase.auth.admin.getUserById(id)
      if (error) {
        return NextResponse.json({ error: error.message ?? String(error) }, { status: 500 })
      }
      const d = data as unknown
      const hasUser = (val: unknown): val is { user?: SupabaseUser } =>
        !!val && typeof val === 'object' && 'user' in (val as object)
      const userObj: SupabaseUser | null = hasUser(d)
        ? d.user ?? null
        : (d as SupabaseUser | null)
      if (!userObj) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      return NextResponse.json({ user: userObj })
    }

    // Fallback: usar listUsers e filtrar por id
    if (typeof supabase.auth.admin?.listUsers === 'function') {
      const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      if (error) {
        return NextResponse.json({ error: error.message ?? String(error) }, { status: 500 })
      }
      const users = (data as { users?: SupabaseUser[] } | null)?.users ?? []
      const found = users.find((u) => u.id === id) || null
      if (!found) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      return NextResponse.json({ user: found })
    }

  return NextResponse.json({ error: 'Admin methods not available on Supabase client' }, { status: 500 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
