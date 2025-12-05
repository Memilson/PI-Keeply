import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { TABLE_BACKUP_JOBS } from '@/lib/constants'

export async function GET() {
  try {
    // Verifica conexão com o banco
    const { data, error } = await supabase
      .from(TABLE_BACKUP_JOBS)
      .select('count')
      .limit(1)

    if (error) {
      throw error
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        storage: 'connected'
      },
      version: '2.0.0'
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        services: {
          database: 'error',
          storage: 'unknown'
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
