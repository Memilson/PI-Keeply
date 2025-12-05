import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jsonError, requireAuth } from '@/lib/api'
import { TABLE_AGENT_TASKS } from '@/lib/constants'

interface CompleteBody {
  status?: unknown
  error?: unknown
}

const ALLOWED_STATUS = ['DONE', 'ERROR']

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  const params = await context.params
  const taskId = typeof params?.id === 'string' ? params.id : null
  if (!taskId) return jsonError('id obrigatorio', 400)

  let parsed: CompleteBody
  try {
    parsed = await req.json()
  } catch {
    return jsonError('JSON invalido', 400)
  }

  const status = typeof parsed.status === 'string' ? parsed.status.trim().toUpperCase() : ''
  const errorMsg = typeof parsed.error === 'string' ? parsed.error.trim() : null

  if (!ALLOWED_STATUS.includes(status)) {
    return jsonError('status invalido; use DONE ou ERROR', 400)
  }

  // Garante que a task pertence ao usuário autenticado
  const { data: task, error: fetchErr } = await auth.supabase
    .from(TABLE_AGENT_TASKS)
    .select('id, user_id')
    .eq('id', taskId)
    .maybeSingle()

  if (fetchErr) return jsonError(fetchErr.message ?? 'Erro ao buscar tarefa', 500)
  if (!task || task.user_id !== auth.user.id) {
    return jsonError('Tarefa nao encontrada para este usuario', 404)
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateErr } = await auth.supabase
    .from(TABLE_AGENT_TASKS)
    .update({
      status,
      error: errorMsg,
      updated_at: now,
    })
    .eq('id', taskId)
    .select('*')
    .single()

  if (updateErr) {
    return jsonError(updateErr.message ?? 'Erro ao completar tarefa', 500)
  }

  return NextResponse.json({ task: updated })
}
