'use client'

import { useMemo } from 'react'
import { useBackups } from '@/hooks/useBackups'
import { Reveal } from '@/components/UnifiedCommon'
import { DashboardContainer } from '@/components/dashboard/Container'
import { DashboardHeader } from '@/components/dashboard/Header'
import { formatDate, formatFileSize } from '@/lib'
import { keeplyStyles } from '@/styles/keeply'

export default function Panel() {
  const { backups, loading } = useBackups({ limit: 500 })

  // Cálculos de estatísticas
  const totalBackups = backups.length
  const totalFiles = backups.length
  const totalVolume = useMemo(() => backups.reduce((sum, file) => sum + (file.file_size ?? 0), 0), [backups])

  // Backups dos últimos 7 dias
  const last7Days = useMemo(() => {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    return backups.filter((backup) => new Date(backup.uploaded_at) >= sevenDaysAgo)
  }, [backups])

  // Evolução de backups por dia (últimos 7 dias)
  const backupEvolution = useMemo(() => {
    const now = new Date()
    const evolution: Array<{ date: string; count: number }> = []
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      const count = backups.filter((backup) => {
        const backupDate = new Date(backup.uploaded_at)
        return (
          backupDate.getDate() === date.getDate() &&
          backupDate.getMonth() === date.getMonth() &&
          backupDate.getFullYear() === date.getFullYear()
        )
      }).length
      
      evolution.push({ date: dateStr, count })
    }
    
    return evolution
  }, [backups])

  // Tipos de backup (por extensão)
  const backupTypes = useMemo(() => {
    const types: Record<string, number> = {}
    
    backups.forEach((backup) => {
      const extension = backup.filename.split('.').pop()?.toLowerCase() || 'sem extensão'
      types[extension] = (types[extension] || 0) + 1
    })
    
    return Object.entries(types)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }))
  }, [backups])

  // Histórico recente (últimos 10 backups)
  const recentBackups = useMemo(() => {
    return [...backups]
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
      .slice(0, 10)
  }, [backups])

  const maxEvolutionCount = Math.max(...backupEvolution.map((item) => item.count), 1)

  return (
    <DashboardContainer>
      <DashboardHeader
        alignment="center"
        badge={(
          <div className="inline-flex items-center px-4 py-2 bg-[#F3F3F3] border border-gray-200 rounded-sm text-[#737373] text-sm font-medium">
            <div className="w-2 h-2 bg-[#0067B8] rounded-sm mr-2"></div>
            Dados em tempo real
          </div>
        )}
        title={(
          <Reveal>
            <h1 className="text-4xl font-bold text-[#1B1B1B] leading-tight">
              Painel de Controle
            </h1>
          </Reveal>
        )}
        description={(
          <Reveal>
            <p className="text-lg text-[#737373] max-w-2xl mx-auto leading-relaxed">
              Histórico e Estatísticas
            </p>
          </Reveal>
        )}
      />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Cards de Estatísticas */}
        <Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`${keeplyStyles.card.base} p-6 rounded-2xl border border-gray-100`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[#737373] mb-2">Total de Backups</p>
                  <p className="text-3xl font-bold text-[#1B1B1B]">
                    {loading ? '...' : totalBackups}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-50 rounded-2xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#0067B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
              </div>
            </div>

            <div className={`${keeplyStyles.card.base} p-6 rounded-2xl border border-gray-100`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[#737373] mb-2">Arquivos Totais</p>
                  <p className="text-3xl font-bold text-[#1B1B1B]">
                    {loading ? '...' : totalFiles}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-50 rounded-2xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className={`${keeplyStyles.card.base} p-6 rounded-2xl border border-gray-100`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[#737373] mb-2">Volume Total</p>
                  <p className="text-3xl font-bold text-[#1B1B1B]">
                    {loading ? '...' : formatFileSize(totalVolume)}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center`}>
                  <svg className={`w-6 h-6 text-green-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Evolução de Backups */}
        <Reveal>
          <div className={`${keeplyStyles.card.base} p-6 rounded-2xl border border-gray-100`}>
            <h2 className="text-xl font-bold text-[#1B1B1B] mb-6">
              Evolução de Backups (últimos 7 dias)
            </h2>
            {backupEvolution.every((item) => item.count === 0) ? (
              <p className="text-center text-[#737373] py-8">Nenhum backup nos últimos 7 dias</p>
            ) : (
              <div className="space-y-3">
                {backupEvolution.map((item, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-16 text-sm text-[#737373] font-medium">{item.date}</div>
                    <div className="flex-1 bg-gray-100 rounded-xl h-3 relative overflow-hidden">
                      <div
                        className="bg-[#0067B8] h-full rounded-xl transition-all duration-300"
                        style={{ width: `${(item.count / maxEvolutionCount) * 100}%` }}
                      />
                    </div>
                    <div className="w-12 text-sm font-semibold text-[#1B1B1B] text-right">
                      {item.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>

        {/* Tipos de Backup */}
        <Reveal>
          <div className={`${keeplyStyles.card.base} p-6 rounded-2xl border border-gray-100`}>
            <h2 className="text-xl font-bold text-[#1B1B1B] mb-6">Tipos de Backup</h2>
            {backupTypes.length === 0 ? (
              <p className="text-center text-[#737373] py-8">Nenhum dado disponível</p>
            ) : (
              <div className="space-y-4">
                {backupTypes.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#0067B8] rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                        <span className="text-white text-xs font-bold uppercase">
                          {item.type.substring(0, 3)}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-[#1B1B1B]">.{item.type}</p>
                        <p className="text-sm text-[#737373]">{item.count} arquivo(s)</p>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-[#1B1B1B]">{item.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>

        {/* Histórico Recente */}
        <Reveal>
          <div className={`${keeplyStyles.card.base} p-6 rounded-2xl border border-gray-100`}>
            <h2 className="text-xl font-bold text-[#1B1B1B] mb-6">
              Histórico Recente de Backups
            </h2>
            {recentBackups.length === 0 ? (
              <p className="text-center text-[#737373] py-8">Nenhum backup encontrado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-[#F8F9FA]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#737373] uppercase tracking-wider">
                        Arquivo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#737373] uppercase tracking-wider">
                        Tamanho
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#737373] uppercase tracking-wider">
                        Data
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentBackups.map((backup) => (
                      <tr key={backup.id} className="hover:bg-[#F8F9FA]">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-semibold text-[#1B1B1B]">{backup.filename}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-[#737373]">
                          {formatFileSize(backup.file_size)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-[#737373]">
                          {formatDate(backup.uploaded_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Reveal>
      </main>
    </DashboardContainer>
  )
}
