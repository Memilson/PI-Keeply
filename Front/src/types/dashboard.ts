export interface DashboardStats {
  totalFiles: number
  totalSize: number
  recentFiles?: Array<{
    id: string
    filename: string
    file_size: number
    uploaded_at: string
    file_type: string
  }>
  weeklyUploads: Array<{
    day: string
    count: number
  }>
  fileTypeDistribution: Array<{
    type: string
    count: number
    size: number
  }>
  monthlyGrowth: number
  averageFileSize: number
}
