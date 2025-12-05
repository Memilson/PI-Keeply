import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jsonError, requireAgentApiKey } from '@/lib/api'
const REQUIRED_ENV_VARS = ['AWS_KEEPLY_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] as const

type EnvResult =
  | { error: string }
  | {
      bucket: string
      accessKey: string
      secretKey: string
      region: string
      endpoint: string | null
      basePath: string | null
      name: string
      allowedLocationId: string | null
    }

function readEnv(): EnvResult {
  const env: Record<(typeof REQUIRED_ENV_VARS)[number], string | null> = {
    AWS_KEEPLY_BUCKET: process.env.AWS_KEEPLY_BUCKET ?? null,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? null,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? null,
  }

  const missing = REQUIRED_ENV_VARS.filter((k) => !env[k])
  if (missing.length) {
    return { error: `Variáveis de ambiente ausentes: ${missing.join(', ')}` }
  }

  return {
    bucket: env.AWS_KEEPLY_BUCKET as string,
    accessKey: env.AWS_ACCESS_KEY_ID as string,
    secretKey: env.AWS_SECRET_ACCESS_KEY as string,
    region: process.env.AWS_KEEPLY_REGION ?? 'us-east-1',
    endpoint: process.env.AWS_KEEPLY_ENDPOINT ?? null,
    basePath: process.env.AWS_KEEPLY_BASE_PATH ?? null,
    name: process.env.STORAGE_LOCATION_NAME ?? 'Keeply Cloud',
    allowedLocationId: process.env.STORAGE_LOCATION_ID_SHARED ?? null,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentApiKey(req)
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get('location_id')
  if (!locationId) {
    return jsonError('location_id e obrigatorio', 400)
  }

  const env = readEnv()
  if ('error' in env) {
    return jsonError(env.error, 500)
  }

  if (env.allowedLocationId && env.allowedLocationId !== locationId) {
    return jsonError('Destino de storage não permitido para este backend', 403)
  }

  return NextResponse.json({
    location: {
      id: locationId,
      bucket: env.bucket,
      region: env.region,
      endpoint: env.endpoint,
      base_path: env.basePath,
      name: env.name,
    },
    credentials: {
      access_key: env.accessKey,
      secret_key: env.secretKey,
    },
  })
}
