import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jsonError, requireAuth } from '@/lib/api'
import { TABLE_AGENTS } from '@/lib/constants'

function parseAgentStatus(raw: unknown): { state: string; hardware_id?: string | null } {
  if (typeof raw !== 'string') return { state: 'UNKNOWN' }
  try {
    const parsed = JSON.parse(raw) as { state?: string; hardware_id?: string | null }
    return {
      state: parsed.state ?? 'UNKNOWN',
      hardware_id: parsed.hardware_id ?? null,
    }
  } catch {
    return { state: raw }
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  const { supabase, user } = auth
  const deviceId = req.nextUrl.searchParams.get('device_id')?.trim()
  const hardwareId = req.nextUrl.searchParams.get('hardware_id')?.trim()

  let query = supabase
    .from(TABLE_AGENTS)
    .select('id, user_id, device_id, hardware_id, name, hostname, os, arch, activation_code, registered_at, last_seen_at, status')
    .eq('user_id', user.id)

  if (deviceId) query = query.eq('device_id', deviceId)
  if (hardwareId) query = query.eq('hardware_id', hardwareId)

  const { data, error } = await query.order('registered_at', { ascending: false })

  if (error) {
    return jsonError(error.message ?? 'Erro ao listar devices', 500)
  }

  const devices = (data ?? []).map((row) => ({
    ...row,
    parsed_status: parseAgentStatus(row.status),
  }))

  return NextResponse.json({ devices })
}

export async function POST() {
  return jsonError('Use /api/devices/request-activation ou /api/devices/activate', 405)
}
