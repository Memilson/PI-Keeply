import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonError, requireAuth } from '@/lib/api'
import { TABLE_BACKUP_JOBS } from '@/lib/constants'

async function validateDeviceOwnership(
  supabase: SupabaseClient,
  userId: string,
  deviceId: string
) {
  const { data, error } = await supabase
    .from(TABLE_BACKUP_JOBS)
    .select('set_id')
    .eq('user_id', userId)
    .eq('set_id', deviceId)
    .limit(1)

  if (error) {
    return { ok: false as const, message: error.message ?? 'Erro ao validar dispositivo', status: 500 as const }
  }

  if (!data || data.length === 0) {
    return {
      ok: false as const,
      message: 'Device informado não existe ou não pertence ao usuário autenticado',
      status: 404 as const,
    }
  }

  return { ok: true as const }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  const { supabase, user } = auth
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId') ?? undefined

  let query = supabase
    .from('backup_profiles')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (deviceId) {
    query = query.eq('device_id', deviceId)
  }

  const { data, error } = await query
  if (error) {
    return jsonError(error.message ?? 'Erro ao listar perfis', 500)
  }

  return NextResponse.json({ profiles: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  const { supabase, user } = auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('JSON inválido', 400)
  }

  if (!body || typeof body !== 'object') {
    return jsonError('Corpo da requisição deve ser um objeto', 400)
  }

  const {
    name,
    src_path,
    dest_path,
    device_id,
    exclude_patterns,
    encrypt_default,
    object_prefix,
    min_hash_mb,
  } = body as Record<string, unknown>

  if (!name || typeof name !== 'string') {
    return jsonError('name é obrigatório', 400)
  }
  if (!src_path || typeof src_path !== 'string') {
    return jsonError('src_path é obrigatório', 400)
  }

  if (device_id && typeof device_id === 'string') {
    const validation = await validateDeviceOwnership(supabase, user.id, device_id)
    if (!validation.ok) {
      return jsonError(validation.message, validation.status)
    }
  }

  const payload = {
    user_id: user.id,
    name,
    src_path,
    dest_path: typeof dest_path === 'string' ? dest_path : null,
    device_id: typeof device_id === 'string' ? device_id : null,
    exclude_patterns: Array.isArray(exclude_patterns)
      ? exclude_patterns.map((p) => String(p))
      : [],
    encrypt_default: typeof encrypt_default === 'boolean' ? encrypt_default : false,
    object_prefix: typeof object_prefix === 'string' ? object_prefix : null,
    min_hash_mb:
      typeof min_hash_mb === 'number' && Number.isFinite(min_hash_mb)
        ? Math.max(1, Math.floor(min_hash_mb))
        : 50,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('backup_profiles')
    .insert(payload)
    .select('*')
    .single()

  if (insertError) {
    return jsonError(insertError.message ?? 'Erro ao criar perfil', 500)
  }

  return NextResponse.json({ profile: inserted }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  const { supabase, user } = auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('JSON inválido', 400)
  }

  if (!body || typeof body !== 'object') {
    return jsonError('Corpo da requisição deve ser um objeto', 400)
  }

  const {
    id,
    name,
    src_path,
    dest_path,
    device_id,
    exclude_patterns,
    encrypt_default,
    object_prefix,
    min_hash_mb,
  } = body as Record<string, unknown>

  if (!id || typeof id !== 'string') {
    return jsonError('id é obrigatório para atualizar', 400)
  }

  const updates: Record<string, unknown> = {}
  if (typeof name === 'string') updates.name = name
  if (typeof src_path === 'string') updates.src_path = src_path
  if (typeof dest_path === 'string') updates.dest_path = dest_path
  if (typeof object_prefix === 'string') updates.object_prefix = object_prefix
  if (typeof encrypt_default === 'boolean') updates.encrypt_default = encrypt_default
  if (typeof min_hash_mb === 'number' && Number.isFinite(min_hash_mb)) {
    updates.min_hash_mb = Math.max(1, Math.floor(min_hash_mb))
  }
  if (Array.isArray(exclude_patterns)) {
    updates.exclude_patterns = exclude_patterns.map((p) => String(p))
  }

  if (typeof device_id === 'string') {
    const validation = await validateDeviceOwnership(supabase, user.id, device_id)
    if (!validation.ok) {
      return jsonError(validation.message, validation.status)
    }
    updates.device_id = device_id
  }

  const { data: updated, error: updateError } = await supabase
    .from('backup_profiles')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (updateError) {
    return jsonError(updateError.message ?? 'Erro ao atualizar perfil', 500)
  }

  return NextResponse.json({ profile: updated })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  const { supabase, user } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return jsonError('id é obrigatório para remover', 400)
  }

  const { error } = await supabase
    .from('backup_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return jsonError(error.message ?? 'Erro ao remover perfil', 500)
  }

  return NextResponse.json({ ok: true })
}
