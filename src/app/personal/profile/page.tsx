'use client'

import { keeplyStyles } from '@/styles/keeply'
import { ProfileInfo } from '@/components/profile/ProfileComponents'
import { useGerenciarPerfilConfiguracoesESecurity } from '@/hooks/gerenciarPerfilConfiguracoesESecurity'
import { DashboardContainer } from '@/components/dashboard/Container'
import { DashboardHeader } from '@/components/dashboard/Header'

export default function ProfilePage() {
  const { 
    profile,
    stats,
    securitySettings,
    loading,
    error,
    isEditingProfile,
    isChangingPassword,
    handleUpdateProfile,
    handleUpdateSecuritySettings,
    handleChangePassword,
    toggleProfileEditing,
    togglePasswordChanging,
    loadProfile
  } = useGerenciarPerfilConfiguracoesESecurity()

  const handleProfileUpdate = async (data: { name: string; phone: string; avatar?: File }) => {
    const success = await handleUpdateProfile(data)
    if (success) {
      toggleProfileEditing()
    }
    return success
  }

  if (error) {
    return (
      <DashboardContainer className="flex items-center justify-center bg-[#F5F6F9] min-h-screen">
        <div className={`${keeplyStyles.card.base} p-8 text-center max-w-md rounded-2xl border border-gray-100 bg-white`}>
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className={`${keeplyStyles.typography.h3} mb-2`} style={keeplyStyles.fontFamily}>
            Erro ao carregar perfil
          </h3>
          <p className="text-[#737373] mb-4">{error}</p>
          <button
            onClick={loadProfile}
            className="bg-[#0067B8] text-white px-5 py-2.5 rounded-xl hover:bg-[#005A9F] transition-colors shadow-lg shadow-blue-200"
          >
            Tentar novamente
          </button>
        </div>
      </DashboardContainer>
    )
  }

  return (
    <DashboardContainer className="bg-[#F5F6F9] min-h-screen">
      <DashboardHeader
        title={(
          <h1 className={`${keeplyStyles.typography.h1} text-[#1B1B1B]`} style={keeplyStyles.fontFamily}>
            Minha Conta
          </h1>
        )}
        description={(
          <p className="mt-1 text-sm text-[#737373]">
            Veja e atualize suas informações pessoais e senha
          </p>
        )}
        actions={null}
      />

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
          {loading ? (
            /* Loading State */
            <div className="space-y-8">
              {/* Profile Info Skeleton */}
              <div className={`${keeplyStyles.card.base} p-6 rounded-2xl border border-gray-100 bg-white shadow-sm animate-pulse`}>
                <div className="flex items-center space-x-6 mb-6">
                  <div className="w-24 h-24 bg-gray-300 rounded-xl"></div>
                  <div className="flex-1">
                    <div className="h-6 bg-gray-300 rounded mb-2 w-1/3"></div>
                    <div className="h-4 bg-gray-300 rounded mb-1 w-1/2"></div>
                    <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                </div>
              </div>
              
            </div>
          ) : (
            /* Main Content */
            <div className="space-y-8">
              {/* Profile Information */}
              {profile && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <ProfileInfo
                  profile={profile}
                  isEditing={isEditingProfile}
                  onToggleEdit={toggleProfileEditing}
                  onUpdate={handleProfileUpdate}
                  loading={loading}
                  />
                </div>
              )}
              
            </div>
          )}
      </div>
    </DashboardContainer>
  )
}
