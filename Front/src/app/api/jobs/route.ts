import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jsonError, requireAuth } from '@/lib/api'
import { TABLE_BACKUP_JOBS } from '@/lib/constants'
import type { HistoryBackupRecord, Job, JobStatus } from '@/types'

const DEFAULT_KIND: Job['kind'] = 'run_backup'

function mapStatus(status: string | null | undefined): JobStatus {
  switch (status) {
    case 'STARTED':
    case 'PROCESSING':
      return 'running'
    case 'COMPLETED':
    case 'SUCCESS':
      return 'done'
    case 'FAILED':
    case 'CANCELED':
    case 'ERROR':
      return 'failed'
    default:
      return 'pending'
  }
}

function mapRecordToJob(record: HistoryBackupRecord): Job {
  const createdAt = record.startedAt ?? record.finishedAt ?? new Date().toISOString()

  // Monta payload somente se houver dados relevantes
  const payload =
    record.root ||
    record.repoDir ||
    record.containerName ||
    record.storageContainerKey
      ? {
          root: record.root ?? null,
          repo_dir: record.repoDir ?? null,
          container_name: record.containerName ?? null,
          storage_container_key: record.storageContainerKey ?? null,
        }
      : null

  // Resultado: erro ou estatísticas de backup
    const trimmedError = record.errorMessage?.trim()
    const hasTotals = record.filesTotal != null || record.bytesTotal != null
  const result: Record<string, unknown> | null = trimmedError
    ? { error: trimmedError }
    : hasTotals
      ? {
          files_total: record.filesTotal ?? null,
          bytes_total: record.bytesTotal ?? null,
        }
      : null

  return {
    id: record.id ?? `${record.set_id ?? 'unknown'}-${createdAt}`,
    user_id: record.user_id ?? '',
    device_id: record.set_id ?? null,
    kind: DEFAULT_KIND,
    payload,
    status: mapStatus(record.status ?? null),
    result,
    created_at: createdAt,
    started_at: record.startedAt ?? null,
    finished_at: record.finishedAt ?? null,
  }
}

function mapStatusFilter(status: string | null | undefined): string | null {
  switch (status) {
    case 'pending':
      return 'STARTED'
    case 'running':
      return 'PROCESSING'
    case 'done':
      return 'COMPLETED'
    case 'failed':
      return 'FAILED'
    default:
      return null
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof Response) return auth

  const { supabase, user } = auth
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId') ?? undefined
  const status = searchParams.get('status') ?? undefined
  const limitParam = searchParams.get('limit')

  let limit = 20
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return jsonError('limit deve ser um número positivo', 400)
    }
    limit = Math.min(parsed, 100)
  }

  let query = supabase
    .from(TABLE_BACKUP_JOBS)
    .select(
      'id, user_id, set_id, type, status, started_at, finished_at, error_message, root_path, files_scanned, files_processed, bytes_total, bytes_processed, chunks_new, chunks_reused'
    )
    .eq('user_id', user.id)
    .order('started_at', { ascending: false, nullsFirst: true })
    .limit(limit)

  if (deviceId) {
    query = query.eq('set_id', deviceId)
  }

  const mappedStatus = mapStatusFilter(status)
  if (mappedStatus) {
    query = query.eq('status', mappedStatus)
  }

  const { data, error } = await query
  if (error) {
    return jsonError(error.message ?? 'Erro ao consultar jobs', 500)
  }

  const rows: HistoryBackupRecord[] = (data ?? []).map((record: any) => ({
    id: record.id,
    user_id: record.user_id,
    set_id: record.set_id,
    type: record.type,
    status: record.status,
    startedAt: record.started_at,
    finishedAt: record.finished_at,
    errorMessage: record.error_message,
    root: record.root_path,
    repoDir: null,
    containerName: null,
    storageContainerKey: null,
    filesTotal: record.files_scanned,
    bytesTotal: record.bytes_total,
    chunksNew: record.chunks_new,
    chunksReused: record.chunks_reused,
  }))
  const jobs = rows.map(mapRecordToJob)
  return NextResponse.json({ jobs })
}

export async function POST(req: NextRequest) {
  try {
    await req.text()
  } catch {
    // Ignorar erro de leitura do corpo
  }
  return jsonError('Criação de jobs não é suportada nesta versão da API', 405)
}
