import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAuthorizedFetch } from './useAuthorizedFetch'
import type { BackupFile } from '@/types'
import { supabase, TABLE_BACKUP_JOBS } from '@/lib'

interface UseBackupsOptions {
  limit?: number
  auto?: boolean
  realtime?: boolean
}

interface UseBackupsResult {
  backups: BackupFile[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  deleteBackup: (id: string) => Promise<void>
}

export function useBackups(options: UseBackupsOptions = {}): UseBackupsResult {
  const { user } = useAuth()
  const authorizedFetch = useAuthorizedFetch()
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { limit, auto = true, realtime = true } = options

  // Busca inicial dos backups
  const fetchBackups = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (limit) {
        params.set('limit', String(limit))
      }

      const url = `/api/backups${params.toString() ? `?${params.toString()}` : ''}`
      const data = await authorizedFetch<{ backups: BackupFile[] }>(url)
      setBackups(data.backups ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar seus backups'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch, limit, user])

  // Executa automaticamente a busca no início
  useEffect(() => {
    if (auto !== false) {
      fetchBackups()
    }
  }, [fetchBackups, auto])

  // Deleção de backup individual
  const deleteBackup = useCallback(
    async (id: string) => {
      const params = new URLSearchParams({ id })
      await authorizedFetch(`/api/backups?${params.toString()}`, { method: 'DELETE' })
      setBackups((prev) => prev.filter((backup) => backup.id !== id))
    },
    [authorizedFetch]
  )

  // Inscrição em tempo real (Supabase Realtime)
  useEffect(() => {
    if (!realtime || !user?.id) return

    type HistoryBackupRow = {
      id: string
      user_id: string
      root?: string | null
      container_name?: string | null
      storage_container_key?: string | null
      bytes_total?: number | null
      type?: string | null
      status?: string | null
      started_at?: string | null
      finished_at?: string | null
    }

    const normalizeRecord = (record: Partial<HistoryBackupRow>): BackupFile => {
      const typeLabel = record.type
        ? `backup/${record.type.toLowerCase()}`
        : 'backup/unknown'

      return {
        id: record.id ?? crypto.randomUUID(),
        user_id: record.user_id ?? user?.id ?? '',
        filename:
          record.container_name ??
          record.root ??
          record.storage_container_key ??
          record.id ??
          'backup',
        file_path: record.storage_container_key ?? record.root ?? '',
        file_size: record.bytes_total ?? 0,
        file_type: typeLabel,
        uploaded_at:
          record.finished_at ?? record.started_at ?? new Date().toISOString(),
        status: record.status ?? undefined,
        type: record.type ?? undefined,
        started_at: record.started_at ?? null,
        finished_at: record.finished_at ?? null,
      }
    }

    const channel = supabase
      .channel(`backups-history-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE_BACKUP_JOBS,
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE' && payload.old) {
            const deleted = normalizeRecord(payload.old as HistoryBackupRow)
            setBackups((prev) => prev.filter((item) => item.id !== deleted.id))
            return
          }

          if (!payload.new) return
          const nextBackup = normalizeRecord(payload.new as HistoryBackupRow)

          setBackups((prev) => {
            const existingIndex = prev.findIndex(
              (item) => item.id === nextBackup.id
            )
            if (existingIndex === -1) {
              return [nextBackup, ...prev]
            }
            const clone = [...prev]
            clone[existingIndex] = nextBackup
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
    backups,
    loading,
    error,
    refresh: fetchBackups,
    deleteBackup,
  }
}
