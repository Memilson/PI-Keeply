import { useCallback, useState } from 'react'

type ErrorMapper = (error: unknown) => string

/**
 * Pequeno helper para controlar loading/erro em chamadas assíncronas repetitivas.
 * Retorna o estado e uma função `run` que já preenche o erro padrão.
 */
export function useAsyncTask(defaultError?: string | ErrorMapper) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolveError = useCallback(
    (err: unknown, fallback?: string) => {
      if (typeof defaultError === 'function') {
        return defaultError(err)
      }
      const message =
        err instanceof Error && err.message
          ? err.message
          : fallback || defaultError || 'Algo deu errado. Tente novamente.'
      return message
    },
    [defaultError]
  )

  const run = useCallback(
    async <T>(fn: () => Promise<T>, fallbackError?: string): Promise<T | undefined> => {
      setLoading(true)
      setError(null)
      try {
        return await fn()
      } catch (err) {
        setError(resolveError(err, fallbackError))
        return undefined
      } finally {
        setLoading(false)
      }
    },
    [resolveError]
  )

  return { run, loading, error, setError }
}
