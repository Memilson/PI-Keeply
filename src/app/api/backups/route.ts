import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { TABLE_BACKUP_JOBS, BUCKET_BACKUPS } from '@/lib/constants'
import { jsonError, requireAuth } from '@/lib/api'

interface BackupJobRow {
  id: string
  user_id: string
  root_path: string | null
  bytes_total: number | null
  status: string | null
  type: string | null
  started_at: string | null
  finished_at: string | null
}

function toBackupFile(record: BackupJobRow) {
  const fallbackDate = new Date().toISOString()
  const startedAt = record.started_at ?? record.finished_at ?? fallbackDate
  const finishedAt = record.finished_at ?? record.started_at ?? null
  const filename = record.root_path ?? record.id
  const typeLabel = record.type
    ? `backup/${record.type.toLowerCase()}`
    : 'backup/unknown'

  return {
    id: record.id,
    user_id: record.user_id,
    filename,
    file_path: record.root_path ?? '',
    file_size: record.bytes_total ?? 0,
    file_type: typeLabel,
    uploaded_at: finishedAt ?? startedAt,
    status: record.status ?? undefined,
    type: record.type ?? undefined,
    started_at: startedAt,
    finished_at: finishedAt,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  const { supabase, user } = auth
  const { searchParams } = new URL(req.url)
  const limitParam = searchParams.get('limit')

  let limit = 100
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      return jsonError('limit deve ser um número positivo', 400)
    }
    limit = Math.min(parsed, 500)
  }

  const { data, error } = await supabase
    .from(TABLE_BACKUP_JOBS)
    .select(
      `id, user_id, root_path, bytes_total, status, type, started_at, finished_at`
    )
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    return jsonError(error.message ?? 'Erro ao listar backups', 500)
  }

  const normalized = (data ?? []).map((record) =>
    toBackupFile(record as BackupJobRow)
  )

  return NextResponse.json({ backups: normalized })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  const { supabase, user } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return jsonError('id é obrigatório', 400)
  }

  const { data: rawRecord, error: recordError } = await supabase
    .from(TABLE_BACKUP_JOBS)
    .select(
      `id, user_id, root_path, bytes_total, status, type, started_at, finished_at`
    )
    .eq('id', id)
    .maybeSingle()

  if (recordError) {
    return jsonError(recordError.message ?? 'Erro ao buscar backup', 500)
  }

  const record = rawRecord as BackupJobRow | null
  if (!record) {
    return jsonError('Backup não encontrado', 404)
  }
  if (record.user_id !== user.id) {
    return jsonError('Backup não pertence ao usuário autenticado', 403)
  }

  // Remove o registro do banco
  const { error: deleteError } = await supabase
    .from(TABLE_BACKUP_JOBS)
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (deleteError) {
    return jsonError(deleteError.message ?? 'Erro ao remover registro', 500)
  }

  return NextResponse.json({ ok: true })
}
