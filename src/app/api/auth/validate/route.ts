import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sanitizeDigits } from '@/lib/validators'

interface ValidationRequest {
  email?: string
  username?: string
  cpf?: string
  phone?: string
}

export async function POST(request: Request) {
  try {
    const { email: rawEmail, username: rawUsername, cpf: rawCpf, phone: rawPhone } =
      (await request.json()) as ValidationRequest

    const email = rawEmail?.trim().toLowerCase()
    const username = rawUsername?.trim().toLowerCase() || undefined
    const cpf = rawCpf ? sanitizeDigits(rawCpf) : undefined
    const phone = rawPhone ? sanitizeDigits(rawPhone) : undefined

    if (!email) {
      return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 })
    }

    const supabase = createServerClient()

    const availability = {
      emailExists: false,
      usernameExists: false,
      cpfExists: false,
      phoneExists: false,
    }

    const perPage = 200
    let page = 1
    let keepSearching = true

    while (keepSearching) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error) {
        throw error
      }

      const users = data?.users ?? []
      if (!users.length) {
        break
      }

      for (const user of users) {
        // Email
        if (!availability.emailExists && typeof user.email === 'string') {
          if (user.email.toLowerCase() === email) {
            availability.emailExists = true
          }
        }

        const metadata = (user.user_metadata ?? {}) as Record<string, unknown>

        // Username
        if (username && !availability.usernameExists) {
          const metaUsername =
            typeof metadata.username === 'string'
              ? (metadata.username as string).toLowerCase()
              : undefined

          if (metaUsername === username) {
            availability.usernameExists = true
          }
        }

        // CPF
        if (cpf && !availability.cpfExists) {
          const metaCpf =
            typeof metadata.cpf === 'string'
              ? sanitizeDigits(metadata.cpf as string)
              : undefined

          if (metaCpf === cpf) {
            availability.cpfExists = true
          }
        }

        // Telefone
        if (phone && !availability.phoneExists) {
          const metaPhone =
            typeof metadata.phone === 'string'
              ? sanitizeDigits(metadata.phone as string)
              : undefined

          if (metaPhone === phone) {
            availability.phoneExists = true
          }
        }

        const foundAll =
          availability.emailExists &&
          (!username || availability.usernameExists) &&
          (!cpf || availability.cpfExists) &&
          (!phone || availability.phoneExists)

        if (foundAll) {
          keepSearching = false
          break
        }
      }

      if (!keepSearching || users.length < perPage) {
        break
      }

      page += 1
    }

    return NextResponse.json(availability)
  } catch (error) {
    console.error('User validation error', error)
    return NextResponse.json(
      { error: 'Falha ao validar dados do usuário' },
      { status: 500 },
    )
  }
}
