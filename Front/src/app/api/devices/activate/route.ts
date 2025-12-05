import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jsonError, requireAuth } from '@/lib/api'
import { TABLE_AGENTS } from '@/lib/constants'

interface ActivateBody {
  activation_code?: unknown
  name?: unknown
}

function parseStatus(raw: unknown): { hardware_id?: string | null } {
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw) as { hardware_id?: string | null }
    return { hardware_id: parsed.hardware_id ?? null }
  } catch {
    return {}
  }
}

function buildStatus(hardwareId: string | null) {
  return JSON.stringify({ state: 'ACTIVE', hardware_id: hardwareId ?? null })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  let parsed: ActivateBody
  try {
    parsed = await req.json()
  } catch {
    return jsonError('JSON invalido', 400)
  }

  const activationCode = typeof parsed.activation_code === 'string' ? parsed.activation_code.trim() : null
  const desiredName = typeof parsed.name === 'string' ? parsed.name.trim() : null

  if (!activationCode) {
    return jsonError('activation_code e obrigatorio', 400)
  }

  const supabase = auth.supabase
  const { data: agent, error } = await supabase
    .from(TABLE_AGENTS)
    .select('id, user_id, device_id, name, hostname, os, arch, activation_code, status, registered_at, last_seen_at')
    .eq('activation_code', activationCode)
    .maybeSingle()

  if (error) {
    return jsonError(error.message ?? 'Erro ao buscar activation_code', 500)
  }

  if (!agent) {
    return jsonError('Codigo de ativacao invalido ou expirado', 404)
  }

  if (agent.user_id && agent.user_id !== auth.user.id) {
    return jsonError('Codigo ja utilizado por outro usuario', 409)
  }

  const now = new Date().toISOString()
  const statusPayload = buildStatus(parseStatus(agent.status).hardware_id ?? null)

  const { data: updated, error: updateError } = await supabase
    .from(TABLE_AGENTS)
    .update({
      user_id: auth.user.id,
      name: desiredName ?? agent.name ?? agent.hostname,
      registered_at: agent.registered_at ?? now,
      last_seen_at: now,
      status: statusPayload,
    })
    .eq('id', agent.id)
    .select('id, user_id, device_id, name, hostname, os, arch, activation_code, status, registered_at, last_seen_at')
    .single()

  if (updateError) {
    return jsonError(updateError.message ?? 'Erro ao ativar dispositivo', 500)
  }

  return NextResponse.json({ agent: updated })
}
