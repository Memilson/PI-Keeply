import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jsonError } from '@/lib/api'
import { createServerClient } from '@/lib/supabase'
import { TABLE_AGENTS } from '@/lib/constants'

function parseStatus(raw: unknown): { state?: string; hardware_id?: string | null } {
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw) as { state?: string; hardware_id?: string | null }
    return parsed
  } catch {
    return { state: typeof raw === 'string' ? raw : undefined }
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim()
  const deviceId = req.nextUrl.searchParams.get('device_id')?.trim()
  const requestedHardwareId = req.nextUrl.searchParams.get('hardware_id')?.trim()

  if (!code) {
    return jsonError('Parametro code e obrigatorio', 400)
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from(TABLE_AGENTS)
    .select('id, user_id, device_id, name, hostname, os, arch, activation_code, status, registered_at, last_seen_at')
    .eq('activation_code', code)
    .maybeSingle()

  if (error) {
    return jsonError(error.message ?? 'Erro ao buscar codigo', 500)
  }

  if (!data) {
    return jsonError('Codigo nao encontrado', 404)
  }

  // Se device_id foi fornecido e não bate, retorna conflito (mantém proteção contra uso cruzado).
  if (deviceId && data.device_id && data.device_id !== deviceId) {
    return jsonError('device_id nao confere para este codigo', 409)
  }

  const parsedStatus = parseStatus(data.status)
  const storedHardwareId = parsedStatus.hardware_id ?? null
  const activated = !!data.user_id

  if (requestedHardwareId && storedHardwareId && requestedHardwareId !== storedHardwareId) {
    return jsonError('hardware_id nao confere para este codigo', 409)
  }

  return NextResponse.json({
    agent: data,
    activated,
    hardware_id: storedHardwareId,
    parsed_status: parsedStatus,
  })
}
