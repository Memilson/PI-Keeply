import crypto from 'crypto'
import type { NextRequest } from 'next/server'

import { jsonError } from './auth'
import { createServerClient } from '../supabase'
import { TABLE_AGENT_API_KEYS } from '../constants'

export interface AgentApiKeyContext {
  supabase: ReturnType<typeof createServerClient>
  userId: string
  agentId: string | null
  apiKeyId: string
}

function hashKey(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export async function requireAgentApiKey(req: NextRequest): Promise<AgentApiKeyContext | Response> {
  const apiKey = req.headers.get('x-agent-key') ?? req.headers.get('x-api-key')
  if (!apiKey) {
    return jsonError('Missing X-Agent-Key header', 401)
  }

  const trimmed = apiKey.trim()
  if (!trimmed) {
    return jsonError('Missing X-Agent-Key header', 401)
  }

  const keyHash = hashKey(trimmed)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from(TABLE_AGENT_API_KEYS)
    .select('id, user_id, agent_id, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (error) {
    return jsonError(error.message ?? 'Erro ao validar API key', 500)
  }
  if (!data) {
    return jsonError('API key invalida', 401)
  }
  if ((data as { revoked_at?: string | null }).revoked_at) {
    return jsonError('API key revogada', 401)
  }

  return {
    supabase,
    userId: (data as { user_id: string }).user_id,
    agentId: (data as { agent_id: string | null }).agent_id ?? null,
    apiKeyId: (data as { id: string }).id,
  }
}
