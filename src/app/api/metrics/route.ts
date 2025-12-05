import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { formatFileSize } from '@/lib/utils'
import { TABLE_BACKUP_JOBS } from '@/lib/constants'

export async function GET() {
  try {
    // Buscar estatísticas gerais
    const { data: history, error: historyError } = await supabase
      .from(TABLE_BACKUP_JOBS)
      .select('bytes_total, started_at, finished_at, user_id, status, type')

    if (historyError) {
      throw historyError
    }

    const totalBackups = history?.length ?? 0
    const totalSize = history?.reduce((sum, entry) => sum + (entry.bytes_total ?? 0), 0) ?? 0
    const uniqueUsers = new Set(history?.map((entry) => entry.user_id)).size

    // Backups por dia (últimos 7 dias)
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const recentHistory =
      history?.filter((entry) => {
        const reference = entry.finished_at ?? entry.started_at
        if (!reference) return false
        return new Date(reference) > sevenDaysAgo
      }) ?? []

    const dailyUploads: Record<string, number> = {}
    recentHistory.forEach((entry) => {
      const reference = entry.finished_at ?? entry.started_at
      if (!reference) return
      const date = new Date(reference).toDateString()
      dailyUploads[date] = (dailyUploads[date] || 0) + 1
    })

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      metrics: {
        total_files: totalBackups,
        total_size_bytes: totalSize,
        total_size_formatted: formatFileSize(totalSize),
        active_users: uniqueUsers,
        uploads_last_7_days: recentHistory.length,
        daily_uploads: dailyUploads,
        average_file_size: totalBackups > 0 ? Math.round(totalSize / totalBackups) : 0
      },
      system: {
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        node_version: process.version,
        platform: process.platform
      }
    })
  } catch (error) {
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// formatFileSize importado de utilitário compartilhado
