export interface UserProfile {
  id: string
  name: string
  phone: string
  email: string
  created_at: string
  avatar?: string
  lastLogin?: string
  emailVerified: boolean
  phoneVerified?: boolean
  twoFactorEnabled: boolean
}

export interface UserStats {
  totalFiles: number
  totalSize: number
  lastUpload?: string
  accountAge: number
  totalLogins: number
  filesThisMonth: number
  storageThisMonth: number
}

export interface UserPreferences {
  language: 'pt-BR' | 'en-US' | 'es-ES'
  theme: 'light' | 'dark' | 'auto'
  notifications: NotificationSettings
  privacy: PrivacySettings
  backup: BackupSettings
}

export interface NotificationSettings {
  uploadComplete: boolean
  storageLimit: boolean
  newsUpdates: boolean
  email: boolean
  push: boolean
  sms: boolean
  marketing: boolean
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'private'
  showActivity: boolean
  allowDataExport: boolean
  dataAnalytics: boolean
}

export interface BackupSettings {
  autoBackup: boolean
  backupFrequency: 'daily' | 'weekly' | 'monthly'
  maxBackupSize: number
  compressionLevel: 'low' | 'medium' | 'high'
}

export interface SecuritySettings {
  twoFactorEnabled: boolean
  loginNotifications: boolean
  dataAnalytics: boolean
  autoDelete: 'never' | '30days' | '90days' | '1year'
  passwordLastChanged?: string
  activeSessions: number
}

export interface SecurityLog {
  id: string
  action: 'login' | 'logout' | 'password_change' | 'email_change' | 'file_upload' | 'file_delete'
  timestamp: string
  ipAddress: string
  userAgent: string
  location?: string
  success: boolean
  details?: string
}

export interface PasswordChangeData {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export interface ProfileFormData {
  name: string
  phone: string
  avatar?: File
}

export interface ActivityLog {
  id?: string
  type: 'login' | 'upload' | 'delete' | 'profile' | 'security'
  timestamp: string
  description?: string
  ipAddress?: string
  location?: string
  device?: string
  fileName?: string
  status?: 'success' | 'warning' | 'error'
}
