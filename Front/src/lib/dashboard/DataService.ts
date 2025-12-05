import {
  type BackupSummary,
  type ChunkRecord,
  type HistoryBackupRecord,
  type ManifestRecord,
  type ManifestType,
} from '@/interfaces/BackupModels'
import { DatabaseGateway } from './DatabaseGateway'

export interface DataServiceOptions {
  historyLimit?: number
  chunkLimit?: number
  manifestLimit?: number
}

export class DataService {
  constructor(private readonly gateway: DatabaseGateway) {}

  async loadChunkIndex(userId: string, limit?: number): Promise<ChunkRecord[]> {
    return this.gateway.loadChunkIndex(userId, limit)
  }

  async loadHistoryBackup(userId: string, limit?: number): Promise<HistoryBackupRecord[]> {
    return this.gateway.loadHistoryBackup(userId, limit)
  }

  async loadManifests(userId: string, limit?: number): Promise<ManifestRecord[]> {
    return this.gateway.loadManifests(userId, limit)
  }

  async loadAll(userId: string, options: DataServiceOptions = {}) {
    const [chunkRecords, historyRecords, manifestRecords] = await Promise.all([
      this.loadChunkIndex(userId, options.chunkLimit),
      this.loadHistoryBackup(userId, options.historyLimit),
      this.loadManifests(userId, options.manifestLimit),
    ])

    return {
      chunkRecords,
      historyRecords,
      manifestRecords,
    }
  }

  getBackupSummary(
    historyRecords: HistoryBackupRecord[],
    chunkRecords: ChunkRecord[],
    manifestRecords: ManifestRecord[]
  ): BackupSummary {
    const totalBackups = historyRecords.length
    const totalBytes = historyRecords.reduce((sum, record) => sum + (record.bytesTotal ?? 0), 0)

    const bytesByDayMap = new Map<string, number>()
    historyRecords.forEach((record) => {
      if (!record.startedAt) return
      const date = new Date(record.startedAt)
      if (Number.isNaN(date.getTime())) return
      const key = date.toISOString().slice(0, 10)
      bytesByDayMap.set(key, (bytesByDayMap.get(key) ?? 0) + (record.bytesTotal ?? 0))
    })

    const bytesByDay = Array.from(bytesByDayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .map(([key, value]) => {
        const date = new Date(key)
        const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        return { date: key, label, totalBytes: value }
      })

    const chunkUsage = historyRecords.reduce(
      (acc, record) => {
        acc.new += record.chunksNew ?? 0
        acc.reused += record.chunksReused ?? 0
        return acc
      },
      { new: 0, reused: 0 }
    )

    const compressionTotals = chunkRecords.reduce(
      (acc, record) => {
        acc.totalOriginalSize += record.originalSize
        acc.totalCompressedSize += record.compressedSize
        return acc
      },
      { totalOriginalSize: 0, totalCompressedSize: 0 }
    )

    const savings = Math.max(compressionTotals.totalOriginalSize - compressionTotals.totalCompressedSize, 0)
    const ratio =
      compressionTotals.totalOriginalSize > 0
        ? compressionTotals.totalCompressedSize / compressionTotals.totalOriginalSize
        : 0

    const manifestCounts = manifestRecords.reduce((acc, record) => {
      const key = record.type
      const value = acc.get(key) ?? 0
      acc.set(key, value + 1)
      return acc
    }, new Map<ManifestType, number>())

    const totalManifestCount = Array.from(manifestCounts.values()).reduce((sum, value) => sum + value, 0)
    const manifestTypeDistribution = Array.from(manifestCounts.entries()).map(([type, count]) => ({
      type,
      count,
      percentage: totalManifestCount > 0 ? Math.round((count / totalManifestCount) * 100) : 0,
    }))

    const recentHistory = historyRecords.slice(0, 5)

    return {
      totalBackups,
      totalBytes,
      bytesByDay,
      chunkUsage,
      compression: {
        totalOriginalSize: compressionTotals.totalOriginalSize,
        totalCompressedSize: compressionTotals.totalCompressedSize,
        savings,
        ratio,
      },
      manifestTypeDistribution,
      recentHistory,
    }
  }

  getLatestManifest(manifests: ManifestRecord[]): ManifestRecord | null {
    if (manifests.length === 0) {
      return null
    }

    return [...manifests].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime()
      const bTime = new Date(b.timestamp).getTime()
      return bTime - aTime
    })[0]
  }
}
