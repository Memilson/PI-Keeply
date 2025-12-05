export type ManifestType = 'FULL' | 'INCREMENTAL' | 'RESTORE'

export interface ChunkRecord {
  hashSha256: string
  containerKey: string
  chunkOffset: number
  originalSize: number
  compressedSize: number
  firstManifestId: string
  lastManifestId: string
  lastSeenAt: string
  setId: string
}

export interface HistoryBackupRecord {
  id: string
  manifestId: string | null
  parentManifestId: string | null
  root: string
  repoDir: string | null
  dataDir: string | null
  containerName: string | null
  type: string
  status: string
  filesTotal: number | null
  bytesTotal: number | null
  chunksNew: number | null
  chunksReused: number | null
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
  backupId: string | null
  setId: string | null
  storageContainerKey: string | null
}

export interface ManifestRecord {
  id: string
  parentManifestId: string | null
  root: string
  repoDir: string | null
  type: ManifestType
  timestamp: string
  containerKey: string | null
  backupId: string | null
  containerSize: number | null
  containerChecksum: string | null
  files: unknown
  setId: string | null
}

export interface BackupSummary {
  totalBackups: number
  totalBytes: number
  bytesByDay: Array<{
    date: string
    label: string
    totalBytes: number
  }>
  chunkUsage: {
    new: number
    reused: number
  }
  compression: {
    totalOriginalSize: number
    totalCompressedSize: number
    savings: number
    ratio: number
  }
  manifestTypeDistribution: Array<{
    type: ManifestType
    count: number
    percentage: number
  }>
  recentHistory: HistoryBackupRecord[]
}
