import type {
  BackupSummary,
  ChunkRecord,
  HistoryBackupRecord,
  ManifestRecord,
} from '@/interfaces/BackupModels'
import { DataService } from './DataService'

export interface DashboardControllerState {
  loading: boolean
  error: string | null
  chunkRecords: ChunkRecord[]
  historyRecords: HistoryBackupRecord[]
  manifestRecords: ManifestRecord[]
  summary: BackupSummary | null
  latestManifest: ManifestRecord | null
}

export interface DashboardControllerOptions {
  historyLimit?: number
  chunkLimit?: number
  manifestLimit?: number
}

export class DashboardController {
  private state: DashboardControllerState

  constructor(private readonly dataService: DataService) {
    this.state = {
      loading: true,
      error: null,
      chunkRecords: [],
      historyRecords: [],
      manifestRecords: [],
      summary: null,
      latestManifest: null,
    }
  }

  getState(): DashboardControllerState {
    return this.state
  }

  async refresh(userId: string, options: DashboardControllerOptions = {}): Promise<DashboardControllerState> {
    this.state = { ...this.state, loading: true, error: null }

    try {
      const [chunkRecords, historyRecords, manifestRecords] = await Promise.all([
        this.dataService.loadChunkIndex(userId, options.chunkLimit),
        this.dataService.loadHistoryBackup(userId, options.historyLimit),
        this.dataService.loadManifests(userId, options.manifestLimit),
      ])

      const summary = this.dataService.getBackupSummary(historyRecords, chunkRecords, manifestRecords)
      const latestManifest = this.dataService.getLatestManifest(manifestRecords)

      this.state = {
        loading: false,
        error: null,
        chunkRecords,
        historyRecords,
        manifestRecords,
        summary,
        latestManifest,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar dados do dashboard'
      this.state = {
        ...this.state,
        loading: false,
        error: message,
      }
    }

    return this.state
  }
}
