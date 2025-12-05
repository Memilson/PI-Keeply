import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAuthorizedFetch } from './useAuthorizedFetch'
import type { BackupProfile } from '@/types'

interface UseBackupProfilesOptions {
  deviceId?: string
  auto?: boolean
}

interface UpsertProfileInput {
  id?: string
  name: string
  src_path: string
  dest_path?: string | null
  device_id?: string | null
  exclude_patterns?: string[]
  encrypt_default?: boolean
  object_prefix?: string | null
  min_hash_mb?: number
}

interface UseBackupProfilesResult {
  profiles: BackupProfile[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createProfile: (input: UpsertProfileInput) => Promise<BackupProfile>
  updateProfile: (input: UpsertProfileInput & { id: string }) => Promise<BackupProfile>
  deleteProfile: (id: string) => Promise<void>
}

export function useBackupProfiles(options: UseBackupProfilesOptions = {}): UseBackupProfilesResult {
  const { user } = useAuth()
  const authorizedFetch = useAuthorizedFetch()
  const [profiles, setProfiles] = useState<BackupProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProfiles = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (options.deviceId) {
        params.set('deviceId', options.deviceId)
      }
      const url = `/api/backup-profiles${params.toString() ? `?${params.toString()}` : ''}`
      const data = await authorizedFetch<{ profiles: BackupProfile[] }>(url)
      setProfiles(data.profiles ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar perfis'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch, options.deviceId, user])

  useEffect(() => {
    if (options.auto !== false) {
      fetchProfiles()
    }
  }, [fetchProfiles, options.auto])

  const createProfile = useCallback(
    async (input: UpsertProfileInput) => {
      if (!user?.id) {
        throw new Error('Usuário não autenticado')
      }
      const data = await authorizedFetch<{ profile: BackupProfile }>('/api/backup-profiles', {
        method: 'POST',
        json: {
          name: input.name,
          src_path: input.src_path,
          dest_path: input.dest_path ?? null,
          device_id: input.device_id ?? null,
          exclude_patterns: input.exclude_patterns ?? [],
          encrypt_default: input.encrypt_default ?? false,
          object_prefix: input.object_prefix ?? null,
          min_hash_mb: input.min_hash_mb ?? 50,
        },
      })
      setProfiles((prev) => [data.profile, ...prev])
      return data.profile
    },
    [authorizedFetch, user]
  )

  const updateProfile = useCallback(
    async (input: UpsertProfileInput & { id: string }) => {
      if (!user?.id) {
        throw new Error('Usuário não autenticado')
      }
      const data = await authorizedFetch<{ profile: BackupProfile }>('/api/backup-profiles', {
        method: 'PATCH',
        json: {
          id: input.id,
          name: input.name,
          src_path: input.src_path,
          dest_path: input.dest_path ?? null,
          device_id: input.device_id ?? null,
          exclude_patterns: input.exclude_patterns ?? [],
          encrypt_default: input.encrypt_default ?? false,
          object_prefix: input.object_prefix ?? null,
          min_hash_mb: input.min_hash_mb ?? 50,
        },
      })
      setProfiles((prev) => prev.map((profile) => (profile.id === data.profile.id ? data.profile : profile)))
      return data.profile
    },
    [authorizedFetch, user]
  )

  const deleteProfile = useCallback(
    async (id: string) => {
      const params = new URLSearchParams({ id })
      await authorizedFetch(`/api/backup-profiles?${params.toString()}`, { method: 'DELETE' })
      setProfiles((prev) => prev.filter((profile) => profile.id !== id))
    },
    [authorizedFetch]
  )

  return {
    profiles,
    loading,
    error,
    refresh: fetchProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
  }
}
