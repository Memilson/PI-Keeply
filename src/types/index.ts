import { User as SupabaseUser } from '@supabase/supabase-js'

export type User = SupabaseUser

export interface BackupFile {
  id: string
  user_id: string
  filename: string
  file_path: string
  file_size: number
  file_type: string
  uploaded_at: string
  status?: string
  type?: string
  started_at?: string | null
  finished_at?: string | null
}

export interface AuthState {
  user: User | null
  loading: boolean
}

export type JobStatus = 'pending' | 'running' | 'done' | 'failed'
export type JobKind = 'run_backup' | 'scan_dir' | 'update_settings' | 'restore'

export interface Device {
  id: string
  user_id: string
  name: string | null
  created_at: string
  last_seen_at: string | null
}

export interface Job {
  id: string
  user_id: string
  device_id: string | null
  kind: JobKind
  payload: Record<string, unknown> | null
  status: JobStatus
  result: Record<string, unknown> | null
  created_at: string
  started_at?: string | null
  finished_at?: string | null
}

export interface HistoryBackupRecord {
  id: string | null
  user_id: string | null
  set_id: string | null
  type: string | null
  status: string | null
  startedAt: string | null
  finishedAt: string | null
  errorMessage: string | null
  root: string | null
  repoDir: string | null
  containerName: string | null
  storageContainerKey: string | null
  filesTotal: number | null
  bytesTotal: number | null
  chunksNew: number | null
  chunksReused: number | null
}

export interface BackupProfile {
  id: string
  user_id: string
  device_id: string | null
  name: string
  src_path: string
  dest_path: string | null
  exclude_patterns: string[]
  encrypt_default: boolean
  object_prefix: string | null
  min_hash_mb?: number | null
  created_at: string
  updated_at: string
}

// Reexports para consumo único de tipos do projeto
export * from './dashboard'
export * from './profile'
