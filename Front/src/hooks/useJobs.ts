import { useState, useCallback, useEffect } from 'react'

import { useAuth } from '@/contexts/AuthContext'
import { useAuthorizedFetch } from './useAuthorizedFetch'
import { useAsyncTask } from './useAsyncTask'
import type { HistoryBackupRecord, Job, JobKind, JobStatus } from '@/types'
import { supabase, TABLE_BACKUP_JOBS } from '@/lib'

interface UseJobsOptions {
  deviceId?: string
  status?: JobStatus
  limit?: number
  auto?: boolean
  realtime?: boolean
}

interface CreateJobInput {
  deviceId: string
  kind: JobKind
  payload?: Record<string, unknown>
}

interface UseJobsResult {
  jobs: Job[]
  loading: boolean
  error: string | null
  refresh: (override?: Partial<UseJobsOptions>) => Promise<void>
  createJob: (input: CreateJobInput) => Promise<Job>
}

const DEFAULT_KIND: Job['kind'] = 'run_backup'

function normalizeStatus(status: string | null | undefined): JobStatus {
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

function toJob(record: HistoryBackupRecord): Job {
  const createdAt = record.startedAt ?? record.finishedAt ?? new Date().toISOString()

  const payload =
    record.root || record.repoDir || record.containerName || record.storageContainerKey
      ? {
          root: record.root ?? null,
          repo_dir: record.repoDir ?? null,
          container_name: record.containerName ?? null,
          storage_container_key: record.storageContainerKey ?? null,
        }
      : null

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
    status: normalizeStatus(record.status ?? null),
    result,
    created_at: createdAt,
    started_at: record.startedAt ?? null,
    finished_at: record.finishedAt ?? null,
  }
}

export function useJobs(options: UseJobsOptions = {}): UseJobsResult {
  const { user } = useAuth()
  const authorizedFetch = useAuthorizedFetch()
  const [jobs, setJobs] = useState<Job[]>([])
  const { run, loading, error } = useAsyncTask('Erro ao carregar jobs')

  const { deviceId, status, limit, auto = true, realtime = true } = options

  const fetchJobs = useCallback(
    async (override?: Partial<UseJobsOptions>) => {
      if (!user?.id) return
      await run(async () => {
        const params = new URLSearchParams()
        const effective = {
          deviceId,
          status,
          limit,
          ...override,
        }
        if (effective.deviceId) params.set('deviceId', effective.deviceId)
        if (effective.status) params.set('status', effective.status)
        if (effective.limit) params.set('limit', String(effective.limit))
        const url = `/api/jobs${params.toString() ? `?${params.toString()}` : ''}`
        const data = await authorizedFetch<{ jobs: Job[] | undefined }>(url)
        setJobs(data.jobs ?? [])
      })
    },
    [authorizedFetch, deviceId, status, limit, run, user]
  )

  useEffect(() => {
    if (auto !== false) {
      fetchJobs().catch(() => null)
    }
  }, [fetchJobs, auto])

  const createJob = useCallback(async (input: CreateJobInput): Promise<Job> => {
    void input
    throw new Error('Criação de jobs não é suportada nesta versão.')
  }, [])

  useEffect(() => {
    if (!realtime || !user?.id) return

    const channel = supabase
      .channel(`history-backup-jobs-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_BACKUP_JOBS, filter: `user_id=eq.${user.id}` },
        (payload) => {
          const baseRecord = (payload.new ?? payload.old) as HistoryBackupRecord | null
          if (!baseRecord || baseRecord.user_id !== user.id) return

          setJobs((prev) => {
            if (payload.eventType === 'DELETE' && payload.old) {
              const deletedId = toJob(payload.old as HistoryBackupRecord).id
              return prev.filter((job) => job.id !== deletedId)
            }

            if (!payload.new) return prev
            const nextJob = toJob(payload.new as HistoryBackupRecord)
            const existingIndex = prev.findIndex((job) => job.id === nextJob.id)
            if (existingIndex === -1) {
              return [nextJob, ...prev]
            }
            const clone = [...prev]
            clone[existingIndex] = nextJob
            return clone
          })
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [realtime, user?.id])

  return {
    jobs,
    loading,
    error,
    refresh: fetchJobs,
    createJob,
  }
}
