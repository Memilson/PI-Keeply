import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jsonError, requireAuth } from '@/lib/api'
import { TABLE_AGENT_TASKS } from '@/lib/constants'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  let parsed: { device_id?: unknown; agent_id?: unknown }
  try {
    parsed = await req.json()
  } catch {
    return jsonError('JSON invalido', 400)
  }

  const deviceId = typeof parsed.device_id === 'string' ? parsed.device_id.trim() : null
  const agentId = typeof parsed.agent_id === 'string' ? parsed.agent_id.trim() : null
  if (!deviceId && !agentId) return jsonError('device_id ou agent_id e obrigatorio', 400)

  // busca primeira tarefa pendente do usuario para o device
  const { data: pending, error: selectError } = await auth.supabase
    .from(TABLE_AGENT_TASKS)
    .select('id, user_id, agent_id, device_id, type, payload, status, error, claimed_at, claimed_by, created_at, updated_at')
    .eq('user_id', auth.user.id)
    .or(`device_id.eq.${deviceId ?? ''},agent_id.eq.${agentId ?? ''}`)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(1)

  if (selectError) {
    return jsonError(selectError.message ?? 'Erro ao buscar tarefa', 500)
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ task: null })
  }

  const task = pending[0]
  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await auth.supabase
    .from(TABLE_AGENT_TASKS)
    .update({ status: 'RUNNING', claimed_at: now, claimed_by: deviceId })
    .eq('id', task.id)
    .select('*')
    .single()

  if (updateError) {
    return jsonError(updateError.message ?? 'Erro ao reivindicar tarefa', 500)
  }

  return NextResponse.json({ task: updated })
}
