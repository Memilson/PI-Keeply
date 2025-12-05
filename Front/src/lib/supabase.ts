import { createClient } from '@supabase/supabase-js'

// Variáveis públicas: em client, Next.js só expõe NEXT_PUBLIC_*
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl) {
  throw new Error('Env NEXT_PUBLIC_SUPABASE_URL não definida')
}
if (!supabaseAnonKey) {
  throw new Error('Env NEXT_PUBLIC_SUPABASE_ANON_KEY não definida')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side client (for API routes)
export const createServerClient = () => {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined
  if (!supabaseServiceKey) {
    throw new Error('Env SUPABASE_SERVICE_ROLE_KEY não definida')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
