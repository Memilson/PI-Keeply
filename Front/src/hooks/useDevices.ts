import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAuthorizedFetch } from './useAuthorizedFetch'
import type { Device } from '@/types'

interface UseDevicesOptions {
  auto?: boolean
}

interface RegisterDeviceInput {
  id: string
  name?: string | null
}

interface UseDevicesResult {
  devices: Device[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  registerDevice: (input: RegisterDeviceInput) => Promise<Device>
}

export function useDevices(options: UseDevicesOptions = {}): UseDevicesResult {
  const { user } = useAuth()
  const authorizedFetch = useAuthorizedFetch()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDevices = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const data = await authorizedFetch<{ devices: Device[] }>('/api/devices')
      setDevices(data.devices ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar seus dispositivos'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch, user])

  useEffect(() => {
    if (options.auto !== false) {
      fetchDevices()
    }
  }, [fetchDevices, options.auto])

  const registerDevice = useCallback(
    async ({ id, name }: RegisterDeviceInput) => {
      if (!user?.id) {
        throw new Error('Por favor, faça login primeiro')
      }
      setError(null)
      const data = await authorizedFetch<{ device: Device }>('/api/devices', {
        method: 'POST',
        json: { id, name: name ?? null },
      })
      setDevices((prev) => {
        const existing = prev.find((device) => device.id === data.device.id)
        if (existing) {
          return prev.map((device) => (device.id === data.device.id ? data.device : device))
        }
        return [data.device, ...prev]
      })
      return data.device
    },
    [authorizedFetch, user]
  )

  return {
    devices,
    loading,
    error,
    refresh: fetchDevices,
    registerDevice,
  }
}
