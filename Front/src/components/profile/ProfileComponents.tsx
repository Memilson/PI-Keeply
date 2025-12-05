'use client'

import { useState } from 'react'
import Image from 'next/image'

import { keeplyStyles, getButtonClass } from '@/styles/keeply'
import type {
  ActivityLog as ActivityLogEntry,
  UserProfile,
  ProfileFormData,
  UserStats,
  SecuritySettings as SecuritySettingsModel,
  PasswordChangeData,
} from '@/types/profile'

interface ActivityLogProps {
  activities: ActivityLogEntry[]
  loading: boolean
}

export function ActivityLog({ activities, loading }: ActivityLogProps) {
  const getActivityIcon = (type: string) => {
    const iconProps = {
      className: 'w-5 h-5 text-white',
      fill: 'none',
      stroke: 'currentColor',
      viewBox: '0 0 24 24',
    }

    const base = 'w-8 h-8 rounded-full flex items-center justify-center'

    switch (type) {
      case 'login':
        return (
          <div className={`${base} bg-green-600`}>
            <svg {...iconProps}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          </div>
        )
      case 'upload':
        return (
          <div className={`${base} bg-blue-600`}>
            <svg {...iconProps}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
        )
      case 'delete':
        return (
          <div className={`${base} bg-red-600`}>
            <svg {...iconProps}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
        )

      case 'profile':
        return (
          <div className={`${base} bg-orange-600`}>
            <svg {...iconProps}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )
      case 'security':
        return (
          <div className={`${base} bg-yellow-600`}>
            <svg {...iconProps}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        )
      default:
        return (
          <div className={`${base} bg-gray-600`}>
            <svg {...iconProps}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
    }
  }

  const getActivityDescription = (activity: ActivityLogEntry) => {
    switch (activity.type) {
      case 'login':
        return `Você entrou de ${activity.ipAddress || 'localização desconhecida'}`
      case 'upload':
        return `Enviou "${activity.fileName || 'arquivo'}"`
      case 'delete':
        return `Excluiu "${activity.fileName || 'arquivo'}"`
      case 'profile':
        return 'Dados da conta atualizados'
      case 'security':
        return activity.description || 'Configuração de segurança alterada'
      default:
        return activity.description || 'Atividade realizada'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      return `Hoje às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    }

    if (diffDays === 2) {
      return `Ontem às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    }

    if (diffDays <= 7) {
      return `${diffDays - 1} dias atrás`
    }

    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getLocationInfo = (activity: ActivityLogEntry) => {
    if (activity.location && activity.device) {
      return `${activity.location} • ${activity.device}`
    }
    if (activity.location) return activity.location
    if (activity.device) return activity.device
    return null
  }

  return (
    <div>
      <h2 className={`${keeplyStyles.typography.h2} mb-6`} style={keeplyStyles.fontFamily}>
        Histórico de atividades
      </h2>

      <div className={`${keeplyStyles.card.base} p-6 shadow-sm`}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#0067B8] border-t-transparent"></div>
            <span className="ml-3 text-[#737373]">Carregando atividades...</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-[#737373] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-[#737373]">Nenhuma atividade registrada</p>
          </div>
        ) : (
          <div className="space-y-6">
            {activities.map((activity, index) => (
              <div key={activity.id || index} className="flex items-start space-x-4">
                {getActivityIcon(activity.type)}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#1B1B1B]">{getActivityDescription(activity)}</p>
                    <span className="text-xs text-[#737373] whitespace-nowrap ml-4">{formatDate(activity.timestamp)}</span>
                  </div>

                  <div className="mt-1 text-xs text-[#737373] space-y-1">
                    {getLocationInfo(activity) && (
                      <div className="flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {getLocationInfo(activity)}
                      </div>
                    )}

                    {activity.ipAddress && (
                      <div className="flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                        IP: {activity.ipAddress}
                      </div>
                    )}

                    {activity.status && (
                      <div className="flex items-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            activity.status === 'success'
                              ? 'bg-green-100 text-green-800'
                              : activity.status === 'warning'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {activity.status === 'success' ? 'Sucesso' : activity.status === 'warning' ? 'Aviso' : 'Erro'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {activities.length >= 10 && (
              <div className="text-center pt-4 border-t border-gray-200">
                <button className="text-[#0067B8] hover:text-blue-700 text-sm font-medium">Ver histórico completo</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface ProfileInfoProps {
  profile: UserProfile
  isEditing: boolean
  onToggleEdit: () => void
  onUpdate: (data: ProfileFormData) => Promise<boolean>
  loading: boolean
}

export function ProfileInfo({ profile, isEditing, onToggleEdit, onUpdate, loading }: ProfileInfoProps) {
  const [formData, setFormData] = useState<ProfileFormData>({
    name: profile.name,
    phone: profile.phone,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onUpdate(formData)
  }

  const handleCancel = () => {
    setFormData({
      name: profile.name,
      phone: profile.phone,
    })
    onToggleEdit()
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  return (
    <div className="mb-8">
      <h2 className={`${keeplyStyles.typography.h2} mb-6`} style={keeplyStyles.fontFamily}>
        Suas informações
      </h2>

      <div className={`${keeplyStyles.card.base} p-6 shadow-sm`}>
        <div className="flex items-start space-x-6">
          <div className="flex-shrink-0">
            <div className="relative w-20 h-20 bg-[#0067B8] rounded-sm flex items-center justify-center">
              {profile.avatar ? (
                <Image
                  src={profile.avatar}
                  alt={profile.name || profile.email}
                  fill
                  className="object-cover rounded-sm"
                  sizes="80px"
                  unoptimized
                />
              ) : (
                <span className="text-2xl font-bold text-white">{getInitials(profile.name || profile.email)}</span>
              )}
            </div>
          </div>

          <div className="flex-1">
            {isEditing ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1B1B1B] mb-1">Nome completo</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-[#0067B8] focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1B1B1B] mb-1">Telefone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-[#0067B8] focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`${getButtonClass('primary')} disabled:opacity-50`}
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        Salvando...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Salvar
                      </>
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={loading}
                    className={getButtonClass('secondary')}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`${keeplyStyles.typography.h3}`} style={keeplyStyles.fontFamily}>
                    {profile.name || 'Nome não informado'}
                  </h3>
                  <button onClick={onToggleEdit} className={getButtonClass('secondary')}>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                  </button>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-[#737373] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                    <span className="text-[#1B1B1B] font-medium">{profile.email}</span>
                    {profile.emailVerified && (
                      <span className="ml-2 inline-flex items-center px-2 py-1 rounded-sm text-xs bg-green-100 text-green-800">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Verificado
                      </span>
                    )}
                  </div>

                  {profile.phone && (
                    <div className="flex items-center">
                      <svg className="w-4 h-4 text-[#737373] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="text-[#1B1B1B]">{profile.phone}</span>
                      {profile.phoneVerified && (
                        <span className="ml-2 inline-flex items-center px-2 py-1 rounded-sm text-xs bg-green-100 text-green-800">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Verificado
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-[#737373] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a4 4 0 118 0v4m-4 6v6m-3 0h6" />
                    </svg>
                    <span className="text-[#1B1B1B]">Conta criada em {formatDate(profile.created_at)}</span>
                  </div>

                  {profile.lastLogin && (
                    <div className="flex items-center">
                      <svg className="w-4 h-4 text-[#737373] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-[#1B1B1B]">Último acesso: {formatDate(profile.lastLogin)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ProfileStatsProps {
  stats: UserStats
}

export function ProfileStats({ stats }: ProfileStatsProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDays = (days: number): string => {
    if (days === 0) return 'Hoje'
    if (days === 1) return '1 dia'
    if (days < 30) return `${days} dias`
    if (days < 365) return `${Math.floor(days / 30)} meses`
    return `${Math.floor(days / 365)} anos`
  }

  return (
    <div className="mb-8">
      <h2 className={`${keeplyStyles.typography.h2} mb-6`} style={keeplyStyles.fontFamily}>
        Seus números
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className={`${keeplyStyles.card.base} p-6 shadow-sm`}>
          <div className="flex items-center">
            <div className="w-10 h-10 bg-[#0067B8] rounded-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-[#737373]">Arquivos guardados</p>
              <p className="text-2xl font-bold text-[#1B1B1B]">{stats.totalFiles}</p>
            </div>
          </div>
        </div>

        <div className={`${keeplyStyles.card.base} p-6 shadow-sm`}>
          <div className="flex items-center">
            <div className="w-10 h-10 bg-purple-600 rounded-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-[#737373]">Espaço usado</p>
              <p className="text-2xl font-bold text-[#1B1B1B]">{formatFileSize(stats.totalSize)}</p>
            </div>
          </div>
        </div>

        <div className={`${keeplyStyles.card.base} p-6 shadow-sm`}>
          <div className="flex items-center">
            <div className="w-10 h-10 bg-green-600 rounded-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-[#737373]">Conta criada há</p>
              <p className="text-2xl font-bold text-[#1B1B1B]">{formatDays(stats.accountAge)}</p>
            </div>
          </div>
        </div>

        <div className={`${keeplyStyles.card.base} p-6 shadow-sm`}>
          <div className="flex items-center">
            <div className="w-10 h-10 bg-yellow-600 rounded-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-[#737373]">Vezes que você entrou</p>
              <p className="text-2xl font-bold text-[#1B1B1B]">{stats.totalLogins}</p>
            </div>
          </div>
        </div>
      </div>

      <div className={`${keeplyStyles.card.base} p-6 mt-6 shadow-sm`}>
        <h3 className={`${keeplyStyles.typography.h3} mb-4`} style={keeplyStyles.fontFamily}>
          Atividade deste mês
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-center justify-between p-4 bg-[#F3F3F3] rounded-sm">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-[#0067B8] rounded-sm flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#1B1B1B]">Arquivos enviados</p>
                <p className="text-xs text-[#737373]">Neste mês</p>
              </div>
            </div>
            <span className="text-xl font-bold text-[#0067B8]">{stats.filesThisMonth}</span>
          </div>

          <div className="flex items-center justify-between p-4 bg-[#F3F3F3] rounded-sm">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-purple-600 rounded-sm flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#1B1B1B]">Dados armazenados</p>
                <p className="text-xs text-[#737373]">Neste mês</p>
              </div>
            </div>
            <span className="text-xl font-bold text-purple-600">{formatFileSize(stats.storageThisMonth)}</span>
          </div>
        </div>

        {stats.lastUpload && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-[#737373]">
              Último upload: <span className="font-medium text-[#1B1B1B]">{stats.lastUpload}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

interface SecuritySettingsProps {
  settings: SecuritySettingsModel
  onUpdateSettings: (settings: Partial<SecuritySettingsModel>) => void
  onChangePassword: (data: PasswordChangeData) => Promise<boolean>
  isChangingPassword: boolean
  onTogglePasswordChange: () => void
  loading: boolean
}

export function SecuritySettings({
  settings,
  onUpdateSettings,
  onChangePassword,
  isChangingPassword,
  onTogglePasswordChange,
  loading,
}: SecuritySettingsProps) {
  const [passwordData, setPasswordData] = useState<PasswordChangeData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const success = await onChangePassword(passwordData)
    if (success) {
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    }
  }

  const handlePasswordCancel = () => {
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    onTogglePasswordChange()
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Nunca'
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  return (
    <div className="mb-8">
      <h2 className={`${keeplyStyles.typography.h2} mb-6`} style={keeplyStyles.fontFamily}>
        Configurações de segurança
      </h2>
      
      <div className={`${keeplyStyles.card.base} p-6 shadow-sm`}>
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={`${keeplyStyles.typography.h3} mb-1`} style={keeplyStyles.fontFamily}>
                Senha
              </h3>
              <p className="text-sm text-[#737373]">
                Última alteração: {formatDate(settings.passwordLastChanged)}
              </p>
            </div>
            <button onClick={onTogglePasswordChange} disabled={loading} className={getButtonClass('secondary')}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Alterar senha
            </button>
          </div>

          {isChangingPassword && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 p-4 bg-[#F3F3F3] rounded-sm">
              <div>
                <label className="block text-sm font-medium text-[#1B1B1B] mb-1">
                  Senha atual
                </label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-[#0067B8] focus:border-transparent"
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1B1B1B] mb-1">
                    Nova senha
                  </label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-[#0067B8] focus:border-transparent"
                    required
                    minLength={6}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#1B1B1B] mb-1">
                    Confirmar nova senha
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-[#0067B8] focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div className="flex space-x-3">
                <button type="submit" className={getButtonClass('primary')}>
                  Confirmar nova senha
                </button>
                <button type="button" onClick={handlePasswordCancel} className={getButtonClass('secondary')}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold text-[#1B1B1B] mb-2">Preferências gerais</p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center space-x-3 text-sm text-[#1B1B1B]">
                <input
                  type="checkbox"
                  checked={settings.loginNotifications}
                  onChange={(e) => onUpdateSettings({ loginNotifications: e.target.checked })}
                />
                <span>Alertas de login em novos dispositivos</span>
              </label>
              <label className="flex items-center space-x-3 text-sm text-[#1B1B1B]">
                <input
                  type="checkbox"
                  checked={settings.dataAnalytics}
                  onChange={(e) => onUpdateSettings({ dataAnalytics: e.target.checked })}
                />
                <span>Analytics avançado de segurança</span>
              </label>
            </div>
          </div>

          <div className="p-4 border border-gray-200 rounded-sm">
            <div className="flex items-center mb-3">
              <div className="w-10 h-10 bg-red-600 rounded-sm flex items-center justify-center mr-4">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-[#1B1B1B]">Exclusão automática</h4>
                <p className="text-sm text-[#737373]">Excluir arquivos automaticamente após período</p>
              </div>
            </div>
            <select
              value={settings.autoDelete}
              onChange={(e) =>
                onUpdateSettings({ autoDelete: e.target.value as 'never' | '30days' | '90days' | '1year' })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-[#0067B8] focus:border-transparent text-sm"
            >
              <option value="never">Nunca excluir</option>
              <option value="30days">Após 30 dias</option>
              <option value="90days">Após 90 dias</option>
              <option value="1year">Após 1 ano</option>
            </select>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h4 className="font-semibold text-[#1B1B1B] mb-3">Sessões ativas</h4>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#737373]">
              {settings.activeSessions} sessão{settings.activeSessions !== 1 ? 'ões' : ''} ativa{settings.activeSessions !== 1 ? 's' : ''}
            </span>
            <button
              className={`${getButtonClass('secondary')} text-red-600 border-red-300 hover:bg-red-50`}
              disabled={loading}
            >
              Encerrar outras sessões
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
