const hits = new Map<string, { count: number; ts: number }>()

export function rateLimit(key: string, limit = 60, windowMs = 60_000) {
  const now = Date.now()
  const v = hits.get(key) ?? { count: 0, ts: now }
  if (now - v.ts > windowMs) {
    v.count = 0
    v.ts = now
  }
  v.count++
  hits.set(key, v)
  return v.count <= limit
}
