import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jsonError, requireAuth } from '@/lib/api'
import { TABLE_AGENT_TASKS, TABLE_AGENTS, TABLE_BACKUP_JOBS } from '@/lib/constants'

interface CreateTaskBody {
  agent_id?: unknown
  device_id?: unknown
  type?: unknown
  payload?: unknown
}

const ALLOWED_TYPES = ['BACKUP', 'RESTORE']
const ALLOWED_MODES = ['full', 'incremental', 'auto']

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const modeRaw = typeof payload.mode === 'string' ? payload.mode.trim().toLowerCase() : null
  const kindRaw = typeof payload.kind === 'string' ? payload.kind.trim().toLowerCase() : null
  const shouldValidateMode = modeRaw !== null || payload.mode !== undefined || kindRaw === 'run_backup'

  if (shouldValidateMode) {
    if (!modeRaw || !ALLOWED_MODES.includes(modeRaw)) {
      throw new Error('mode invalido; use full, incremental ou auto')
    }
  }

  return shouldValidateMode ? { ...payload, mode: modeRaw } : payload
}

async function determineBackupMode(
  supabase: any,
  userId: string,
  deviceId: string | null,
  srcPath: string | undefined,
  requestedMode: string
): Promise<string> {
  // Se não for 'auto', mantém o modo solicitado
  if (requestedMode !== 'auto') {
    return requestedMode
  }

  // Modo 'auto': verifica se existe backup full do diretório
  if (!srcPath) {
    return 'full' // Sem caminho específico, faz full
  }

  const { data: existingBackups } = await supabase
    .from(TABLE_BACKUP_JOBS)
    .select('id, type, root_path')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .eq('root_path', srcPath)
    .eq('type', 'FULL')
    .eq('status', 'COMPLETED')
    .order('created_at', { ascending: false })
    .limit(1)

  // Se já existe backup full concluído deste diretório, faz incremental
  if (existingBackups && existingBackups.length > 0) {
    return 'incremental'
  }

  // Senão, faz full
  return 'full'
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  let body: CreateTaskBody
  try {
    body = await req.json()
  } catch {
    return jsonError('JSON invalido', 400)
  }

  const agentId = typeof body.agent_id === 'string' ? body.agent_id.trim() : null
  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : null
  const type = typeof body.type === 'string' ? body.type.trim() : 'BACKUP'
  const payload = typeof body.payload === 'object' && body.payload !== null ? body.payload : {}

  if (!agentId) return jsonError('agent_id e obrigatorio', 400)
  if (!ALLOWED_TYPES.includes(type)) return jsonError('type invalido', 400)

  let normalizedPayload = payload as Record<string, unknown>
  try {
    normalizedPayload = sanitizePayload(payload as Record<string, unknown>)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payload invalido'
    return jsonError(message, 400)
  }

  // valida se o agent pertence ao usuario
  const { data: agentRow, error: agentErr } = await auth.supabase
    .from(TABLE_AGENTS)
    .select('id, user_id, device_id')
    .eq('id', agentId)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (agentErr) return jsonError(agentErr.message ?? 'Erro ao validar agente', 500)
  if (!agentRow) return jsonError('Agente nao encontrado para este usuario', 404)

  // Se for backup com mode 'auto', determina o modo correto
  if (type === 'BACKUP' && normalizedPayload.mode === 'auto') {
    const srcPath = typeof normalizedPayload.src_path === 'string' ? normalizedPayload.src_path : undefined
    const finalMode = await determineBackupMode(
      auth.supabase,
      auth.user.id,
      deviceId ?? agentRow.device_id,
      srcPath,
      'auto'
    )
    normalizedPayload = { ...normalizedPayload, mode: finalMode }
  }

  const insertPayload = {
    user_id: auth.user.id,
    agent_id: agentId,
    device_id: deviceId ?? agentRow.device_id,
    type,
    payload: normalizedPayload,
    status: 'PENDING',
    error: null as string | null,
    claimed_at: null as string | null,
    claimed_by: null as string | null,
  }

  const { data, error } = await auth.supabase
    .from(TABLE_AGENT_TASKS)
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    return jsonError(error.message ?? 'Erro ao criar tarefa', 500)
  }

  return NextResponse.json({ task: data }, { status: 201 })
}
