import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'crypto'
import { jsonError } from '@/lib/api'
import { createServerClient } from '@/lib/supabase'
import { TABLE_AGENTS } from '@/lib/constants'

interface ActivationRequestBody {
  device_id?: unknown
  hostname?: unknown
  os?: unknown
  arch?: unknown
  hardware_id?: unknown
  name?: unknown
  activation_code?: unknown
}

const ACTIVATION_CODE_LENGTH = 6

function generateActivationCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(ACTIVATION_CODE_LENGTH, '0')
}

type ValidationResult =
  | { error: string }
  | {
      deviceId: string
      hostname: string
      os: string
      arch: string | null
      hardwareId: string | null
      name: string | null
      providedCode: string | null
    }

function validatePayload(body: ActivationRequestBody): ValidationResult {
  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : null
  const hostname = typeof body.hostname === 'string' ? body.hostname.trim() : null
  const os = typeof body.os === 'string' ? body.os.trim() : null
  const arch = typeof body.arch === 'string' ? body.arch.trim() : null
  const hardwareId = typeof body.hardware_id === 'string' ? body.hardware_id.trim() : null
  const name = typeof body.name === 'string' ? body.name.trim() : null
  const providedCode = typeof body.activation_code === 'string' ? body.activation_code.trim() : null

  if (!deviceId) return { error: 'device_id e obrigatorio' as const }
  if (!hostname) return { error: 'hostname e obrigatorio' as const }
  if (!os) return { error: 'os e obrigatorio' as const }

  return { deviceId, hostname, os, arch, hardwareId, name, providedCode }
}

function buildStatus(state: 'PENDING_ACTIVATION' | 'ACTIVE', hardwareId: string | null) {
  return JSON.stringify({ state, hardware_id: hardwareId ?? null })
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

export async function POST(req: NextRequest) {
  let parsed: ActivationRequestBody
  try {
    parsed = await req.json()
  } catch {
    return jsonError('JSON invalido', 400)
  }

  const validated = validatePayload(parsed)
  if ('error' in validated) {
    return jsonError(validated.error, 400)
  }

  const { deviceId, hostname, os, arch, hardwareId, name, providedCode } = validated
  const supabase = createServerClient()
  const now = new Date().toISOString()

  let codeToUse = providedCode ?? generateActivationCode()

  // Se já existir um registro para este device_id, não cria novo.
  const { data: existingByDevice, error: deviceLookupError } = await supabase
    .from(TABLE_AGENTS)
    .select('id, user_id, device_id, name, hostname, os, arch, activation_code, status, hardware_id, registered_at, last_seen_at')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (deviceLookupError) {
    return jsonError(deviceLookupError.message ?? 'Erro ao buscar device_id', 500)
  }

  if (existingByDevice) {
    // Se já está ativado, apenas retorna o registro (sem alterar user_id)
    if (existingByDevice.user_id) {
      const activationCode = existingByDevice.activation_code ?? codeToUse
      return NextResponse.json({
        activation_code: activationCode,
        agent: existingByDevice,
        activated: true,
      })
    }

    // Pendente: reaproveita activation_code existente ou gera novo e atualiza metadados
    const activationCode = existingByDevice.activation_code ?? codeToUse
    const previousHardware = parseStatus(existingByDevice.status).hardware_id ?? null
    const hardwareToPersist = hardwareId ?? previousHardware

    const { data: updated, error: updateError } = await supabase
      .from(TABLE_AGENTS)
      .update({
        device_id: deviceId,
        name: name ?? existingByDevice.name,
        hostname,
        os,
        arch,
        activation_code: activationCode,
        last_seen_at: now,
        status: buildStatus('PENDING_ACTIVATION', hardwareToPersist),
      })
      .eq('id', existingByDevice.id)
      .select('id, user_id, device_id, name, hostname, os, arch, activation_code, status, hardware_id, registered_at, last_seen_at')
      .single()

    if (updateError) {
      return jsonError(updateError.message ?? 'Erro ao atualizar device existente', 500)
    }

    return NextResponse.json({
      activation_code: activationCode,
      agent: updated,
      activated: false,
    })
  }

  if (providedCode) {
    const { data: existing, error: lookupError } = await supabase
      .from(TABLE_AGENTS)
      .select('id, user_id, device_id, name, hostname, os, arch, activation_code, status, hardware_id, registered_at, last_seen_at')
      .eq('activation_code', providedCode)
      .maybeSingle()

    if (lookupError) {
      return jsonError(lookupError.message ?? 'Erro ao validar activation_code', 500)
    }

    if (existing) {
      if (existing.user_id) {
        return jsonError('Codigo ja ativado por um usuario', 409)
      }

      const previousHardware = parseStatus(existing.status).hardware_id ?? null
      const hardwareToPersist = hardwareId ?? previousHardware

      const { data: updated, error: updateError } = await supabase
        .from(TABLE_AGENTS)
        .update({
          device_id: deviceId ?? existing.device_id,
          name: name ?? existing.name,
          hostname,
          os,
          arch,
          hardware_id: hardwareId ?? existing.hardware_id ?? null,
          last_seen_at: now,
          status: buildStatus('PENDING_ACTIVATION', hardwareToPersist),
        })
        .eq('id', existing.id)
        .select('id, user_id, device_id, name, hostname, os, arch, activation_code, status, hardware_id, registered_at, last_seen_at')
        .single()

      if (updateError) {
        return jsonError(updateError.message ?? 'Erro ao atualizar device', 500)
      }

      return NextResponse.json({
        activation_code: existing.activation_code,
        agent: updated,
        activated: !!updated.user_id,
      })
    }

    // Provided code does not exist; fall back to a new random code.
    codeToUse = generateActivationCode()
  }

  const insertPayload = {
    device_id: deviceId,
    name: name ?? hostname,
    hostname,
    os,
    arch,
    activation_code: codeToUse,
    registered_at: null,
    last_seen_at: now,
    hardware_id: hardwareId ?? null,
    status: buildStatus('PENDING_ACTIVATION', hardwareId ?? null),
    user_id: null as string | null,
  }

  const { data, error } = await supabase
    .from(TABLE_AGENTS)
    .insert(insertPayload)
    .select('id, user_id, device_id, name, hostname, os, arch, activation_code, status, hardware_id, registered_at, last_seen_at')
    .single()

  if (error) {
    return jsonError(error.message ?? 'Erro ao criar activation_code. Confirme se user_id aceita null em agents.', 500)
  }

  return NextResponse.json({ activation_code: codeToUse, agent: data, activated: false }, { status: 201 })
}
