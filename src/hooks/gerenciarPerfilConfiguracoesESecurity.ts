import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useBackups } from './useBackups'
import { 
  UserProfile, 
  UserStats, 
  UserPreferences, 
  SecuritySettings, 
  SecurityLog, 
  PasswordChangeData, 
  ProfileFormData 
} from '@/types/profile'

export const useGerenciarPerfilConfiguracoesESecurity = () => {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null)
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const { backups, loading: backupsLoading, error: backupsError } = useBackups({ realtime: true })

  // Calculate user stats
  const stats = useMemo((): UserStats => {
    if (!profile) {
      return {
        totalFiles: 0,
        totalSize: 0,
        accountAge: 0,
        totalLogins: 0,
        filesThisMonth: 0,
        storageThisMonth: 0
      }
    }

    const accountAge = Math.floor(
      (new Date().getTime() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    const totalFiles = backups.length
    const totalSize = backups.reduce((total, backup) => total + (backup.file_size ?? 0), 0)

    const now = new Date()
    const filesUploadedThisMonth = backups.filter(backup => {
      const uploadedAt = new Date(backup.uploaded_at)
      return uploadedAt.getFullYear() === now.getFullYear() && uploadedAt.getMonth() === now.getMonth()
    })

    const filesThisMonth = filesUploadedThisMonth.length
    const storageThisMonth = filesUploadedThisMonth.reduce(
      (total, backup) => total + (backup.file_size ?? 0),
      0
    )

    const lastUploadDate = backups.reduce<Date | null>((latest, backup) => {
      const uploadedAt = new Date(backup.uploaded_at)
      if (!latest || uploadedAt > latest) {
        return uploadedAt
      }
      return latest
    }, null)

    const lastUpload = lastUploadDate
      ? new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short'
        }).format(lastUploadDate)
      : undefined

    return {
      totalFiles,
      totalSize,
      accountAge,
      totalLogins: securityLogs.filter(log => log.action === 'login' && log.success).length,
      filesThisMonth,
      storageThisMonth,
      lastUpload
    }
  }, [profile, securityLogs, backups])

  // Load user profile
  const loadProfile = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)

      // Create profile object from user metadata
      const userProfile: UserProfile = {
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.name || '',
        phone: user.user_metadata?.phone || '',
        avatar: user.user_metadata?.avatar_url,
        created_at: user.created_at,
        lastLogin: user.last_sign_in_at,
        emailVerified: !!user.email_confirmed_at,
        phoneVerified: !!user.phone_confirmed_at,
        twoFactorEnabled: false
      }

      setProfile(userProfile)

      // Load preferences (default values for now)
      const defaultPreferences: UserPreferences = {
        language: 'pt-BR',
        theme: 'light',
        notifications: {
          uploadComplete: true,
          storageLimit: true,
          newsUpdates: false,
          email: true,
          push: true,
          sms: false,
          marketing: false
        },
        privacy: {
          profileVisibility: 'private',
          showActivity: false,
          allowDataExport: true,
          dataAnalytics: false
        },
        backup: {
          autoBackup: true,
          backupFrequency: 'weekly',
          maxBackupSize: 5 * 1024 * 1024 * 1024, // 5GB
          compressionLevel: 'medium'
        }
      }

      setPreferences(defaultPreferences)

      // Load security settings
      const defaultSecurity: SecuritySettings = {
        twoFactorEnabled: false,
        loginNotifications: true,
        dataAnalytics: false,
        autoDelete: 'never',
        passwordLastChanged: user.updated_at,
        activeSessions: 1
      }

      setSecuritySettings(defaultSecurity)

      // Load security logs (mock data for now)
      const mockLogs: SecurityLog[] = [
        {
          id: '1',
          action: 'login',
          timestamp: new Date().toISOString(),
          ipAddress: '192.168.1.1',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          location: 'São Paulo, BR',
          success: true
        }
      ]

      setSecurityLogs(mockLogs)

    } catch (err) {
      console.error('Error loading profile:', err)
      setError('Erro ao carregar perfil')
    } finally {
      setLoading(false)
    }
  }, [user])

  // Update profile
  const handleUpdateProfile = useCallback(async (formData: ProfileFormData) => {
    if (!user) return false

    try {
      setLoading(true)
      setError(null)

      // Update user metadata in Supabase Auth
      const { error } = await supabase.auth.updateUser({
        data: {
          name: formData.name,
          phone: formData.phone
        }
      })

      if (error) throw error

      // Update local state
      if (profile) {
        setProfile({
          ...profile,
          name: formData.name,
          phone: formData.phone
        })
      }

      setIsEditingProfile(false)
      return true

    } catch (err) {
      console.error('Error updating profile:', err)
      setError('Erro ao atualizar perfil')
      return false
    } finally {
      setLoading(false)
    }
  }, [user, profile])

  // Change password
  const handleChangePassword = useCallback(async (data: PasswordChangeData) => {
    if (!user) return false

    try {
      setLoading(true)
      setError(null)

      if (data.newPassword !== data.confirmPassword) {
        setError('As senhas não coincidem')
        return false
      }

      if (data.newPassword.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres')
        return false
      }

      const { error } = await supabase.auth.updateUser({
        password: data.newPassword
      })

      if (error) throw error

      // Add security log
      const newLog: SecurityLog = {
        id: Date.now().toString(),
        action: 'password_change',
        timestamp: new Date().toISOString(),
          ipAddress: 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        success: true,
        details: 'Password changed successfully'
      }

      setSecurityLogs(prev => [newLog, ...prev])
      setIsChangingPassword(false)
      return true

    } catch (err) {
      console.error('Error changing password:', err)
      setError('Erro ao alterar senha')
      return false
    } finally {
      setLoading(false)
    }
  }, [user])

  // Update preferences
  const handleUpdatePreferences = useCallback((newPreferences: Partial<UserPreferences>) => {
    setPreferences(prev => prev ? { ...prev, ...newPreferences } : null)
  }, [])

  // Update security settings
  const handleUpdateSecuritySettings = useCallback((newSettings: Partial<SecuritySettings>) => {
    setSecuritySettings(prev => prev ? { ...prev, ...newSettings } : null)
  }, [])

  // Toggle profile editing
  const toggleProfileEditing = useCallback(() => {
    setIsEditingProfile(prev => !prev)
    setError(null)
  }, [])

  // Toggle password changing
  const togglePasswordChanging = useCallback(() => {
    setIsChangingPassword(prev => !prev)
    setError(null)
  }, [])

  // Clear error
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Load profile on mount
  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  return {
    profile,
    preferences,
    securitySettings,
    securityLogs,
    stats,
    loading: loading || backupsLoading,
    error: error ?? backupsError,
    isEditingProfile,
    isChangingPassword,
    handleUpdateProfile,
    handleChangePassword,
    handleUpdatePreferences,
    handleUpdateSecuritySettings,
    toggleProfileEditing,
    togglePasswordChanging,
    clearError,
    loadProfile
  }
}
