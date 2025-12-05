import { NextResponse } from 'next/server'
import { rateLimit } from '@/app/api/(utils)/rate-limit'

// Endpoint demonstrativo para rate-limit de login (delegue ao Supabase ou própria lógica)
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (!rateLimit(`login:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  return NextResponse.json({ ok: true })
}
