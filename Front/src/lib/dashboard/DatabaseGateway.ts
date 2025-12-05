import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ChunkRecord,
  HistoryBackupRecord,
  ManifestRecord,
  ManifestType,
} from '@/interfaces/BackupModels'

const DEFAULT_HISTORY_LIMIT = 50
const DEFAULT_CHUNK_LIMIT = 2000
const DEFAULT_MANIFEST_LIMIT = 50

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function parseNullableNumber(value: unknown): number | null {
  const parsed = parseNumber(value)
  return parsed === 0 && (value === null || value === undefined) ? null : parsed
}

function normalizeManifestType(value: unknown): ManifestType {
  if (value === 'FULL') return 'FULL'
  if (value === 'RESTORE') return 'RESTORE'
  return 'INCREMENTAL'
}

export interface LoadOptions {
  userId: string
  historyLimit?: number
  chunkLimit?: number
  manifestLimit?: number
}

export class DatabaseGateway {
  constructor(private readonly client: SupabaseClient) {}

  async loadChunkIndex(userId: string, limit = DEFAULT_CHUNK_LIMIT): Promise<ChunkRecord[]> {
    // Tabela chunk_index não existe no schema atual
    // Os chunks agora estão em snapshot_file_chunks
    // Retornando array vazio por enquanto
    return []
    
    // TODO: Implementar query para snapshot_file_chunks se necessário
    // const { data, error } = await this.client
    //   .from('snapshot_file_chunks')
    //   .select('id, snapshot_file_id, seq, chunk_hash, created_at')
    //   .limit(limit)
  }

  async loadHistoryBackup(userId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<HistoryBackupRecord[]> {
    const { data, error } = await this.client
      .from('backup_jobs')
      .select(
        `id, root_path, type, status, files_scanned, files_processed, bytes_total, bytes_processed, chunks_new, chunks_reused, started_at, finished_at, error_message, set_id`
      )
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Erro ao carregar backup_jobs: ${error.message}`)
    }

    return (data ?? []).map((record) => ({
      id: record.id,
      manifestId: null,
      parentManifestId: null,
      root: record.root_path,
      repoDir: null,
      dataDir: null,
      containerName: null,
      type: record.type,
      status: record.status,
      filesTotal: parseNullableNumber(record.files_scanned),
      bytesTotal: parseNullableNumber(record.bytes_total),
      chunksNew: parseNullableNumber(record.chunks_new),
      chunksReused: parseNullableNumber(record.chunks_reused),
      startedAt: record.started_at,
      finishedAt: record.finished_at,
      errorMessage: record.error_message,
      backupId: null,
      setId: record.set_id,
      storageContainerKey: null,
    }))
  }

  async loadManifests(userId: string, limit = DEFAULT_MANIFEST_LIMIT): Promise<ManifestRecord[]> {
    const { data, error } = await this.client
      .from('snapshots')
      .select(
        `id, parent_snapshot_id, root_path, type, created_at, container_key, job_id, container_size, container_checksum, files_total, set_id`
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Erro ao carregar snapshots: ${error.message}`)
    }

    return (data ?? []).map((record) => ({
      id: record.id,
      parentManifestId: record.parent_snapshot_id,
      root: record.root_path,
      repoDir: null,
      type: normalizeManifestType(record.type),
      timestamp: record.created_at,
      containerKey: record.container_key,
      backupId: record.job_id,
      containerSize: parseNullableNumber(record.container_size),
      containerChecksum: record.container_checksum,
      files: record.files_total,
      setId: record.set_id,
    }))
  }
}
