import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jsonError, requireAuth } from '@/lib/api'
import { TABLE_AGENTS } from '@/lib/constants'

type ValidationResult =
  | {
      deviceId: string
      hostname: string | null
      os: string | null
      arch: string | null
      hardwareFingerprint: string | null
    }
  | { error: string }

function validate(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { error: 'Payload deve ser um objeto JSON' }
  }

  const { device_id, hostname, os, arch, hardware_fingerprint } = body as Record<string, unknown>
  const deviceId = typeof device_id === 'string' ? device_id.trim() : ''
  if (!deviceId) {
    return { error: 'device_id e obrigatorio' }
  }

  return {
    deviceId,
    hostname: typeof hostname === 'string' ? hostname.trim() : null,
    os: typeof os === 'string' ? os.trim() : null,
    arch: typeof arch === 'string' ? arch.trim() : null,
    hardwareFingerprint:
      typeof hardware_fingerprint === 'string' ? hardware_fingerprint.trim().slice(0, 200) : null,
  }
}

const SELECT_FIELDS =
  'id, user_id, device_id, name, hostname, os, arch, registered_at, last_seen_at, status'

function buildStatus(
  deviceId: string,
  hardwareFingerprint: string | null,
  state: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'
) {
  return JSON.stringify({
    state,
    device_id: deviceId,
    hardware_id: hardwareFingerprint,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('JSON invalido', 400)
  }

  const validated = validate(body)
  if ('error' in validated) {
    return jsonError(validated.error, 400)
  }

  const { deviceId, hostname, os, arch, hardwareFingerprint } = validated
  const { supabase, user } = auth
  const now = new Date().toISOString()

  const { data: existing, error: lookupError } = await supabase
    .from(TABLE_AGENTS)
    .select(SELECT_FIELDS)
    .eq('device_id', deviceId)
    .maybeSingle()

  if (lookupError) {
    return jsonError(lookupError.message ?? 'Erro ao buscar agente existente', 500)
  }

  if (existing) {
    if (existing.user_id && existing.user_id !== user.id) {
      return jsonError('device_id ja associado a outro usuario', 403)
    }

    const updatePayload = {
      hostname: hostname ?? existing.hostname,
      os: os ?? existing.os,
      arch: arch ?? existing.arch,
      last_seen_at: now,
      status: buildStatus(deviceId, hardwareFingerprint ?? null, 'ACTIVE'),
    }

    const { data: updated, error: updateError } = await supabase
      .from(TABLE_AGENTS)
      .update(updatePayload)
      .eq('id', existing.id)
      .select(SELECT_FIELDS)
      .single()

    if (updateError) {
      return jsonError(updateError.message ?? 'Erro ao atualizar agente', 500)
    }

    return NextResponse.json({ agent: updated, created: false })
  }

  const insertPayload = {
    device_id: deviceId,
    user_id: user.id,
    name: hostname ?? 'Agente',
    hostname,
    os,
    arch,
    registered_at: now,
    last_seen_at: now,
    status: buildStatus(deviceId, hardwareFingerprint ?? null, 'ACTIVE'),
  }

  const { data: inserted, error: insertError } = await supabase
    .from(TABLE_AGENTS)
    .insert(insertPayload)
    .select(SELECT_FIELDS)
    .single()

  if (insertError) {
    return jsonError(insertError.message ?? 'Erro ao registrar agente', 500)
  }

  return NextResponse.json({ agent: inserted, created: true }, { status: 201 })
}
