import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '../supabase'

export interface AuthContext {
  supabase: ReturnType<typeof createServerClient>
  user: { id: string }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function requireAuth(req: NextRequest): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError('Missing or invalid Authorization header', 401)
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    return jsonError('Missing access token', 401)
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[requireAuth] token rejected', error?.message ?? 'no user')
      return jsonError(`Invalid session: ${error?.message ?? 'unknown'}`, 401)
    }
    return jsonError('Invalid session', 401)
  }

  return {
    supabase,
    user: { id: data.user.id },
  }
}
