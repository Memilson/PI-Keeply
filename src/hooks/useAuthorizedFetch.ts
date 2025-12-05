import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export type AuthorizedFetchParse = 'json' | 'text' | 'blob' | 'arrayBuffer' | 'response'

interface AuthorizedFetchOptions extends RequestInit {
  json?: unknown
  parse?: AuthorizedFetchParse
}

export function useAuthorizedFetch() {
  const { getAccessToken } = useAuth()

  return useCallback(async <T = unknown>(input: RequestInfo | URL, options?: AuthorizedFetchOptions): Promise<T> => {
    const token = await getAccessToken()
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.')
    }

    const { json, parse = 'json', headers: initHeaders, ...rest } = options ?? {}
    const headers = new Headers(initHeaders ?? {})
    headers.set('Authorization', `Bearer ${token}`)

    const fetchInit: RequestInit = { ...rest, headers }

    if (json !== undefined) {
      headers.set('Content-Type', 'application/json')
      fetchInit.body = JSON.stringify(json)
    }

    const response = await fetch(input, fetchInit)
    if (!response.ok) {
      let message = response.statusText || 'Request failed'
      try {
        const data = await response.clone().json()
        if (data && typeof data === 'object' && 'error' in data && data.error) {
          message = String(data.error)
        } else {
          message = JSON.stringify(data)
        }
      } catch {
        try {
          const text = await response.clone().text()
          if (text) message = text
        } catch {
          // ignore
        }
      }
      throw new Error(message)
    }

    switch (parse) {
      case 'text':
        return (await response.text()) as T
      case 'blob':
        return (await response.blob()) as T
      case 'arrayBuffer':
        return (await response.arrayBuffer()) as T
      case 'response':
        return response as T
      case 'json':
      default:
        if (response.status === 204) {
          return undefined as T
        }
        return (await response.json()) as T
    }
  }, [getAccessToken])
}
