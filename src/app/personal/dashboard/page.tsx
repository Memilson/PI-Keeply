'use client'
// Página Resumo: visão geral dos backups do usuário (linguagem simplificada)

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Reveal } from '@/components/UnifiedCommon'
import { useAuth } from '@/contexts/AuthContext'
import { useDevices } from '@/hooks/useDevices'
import { useJobs } from '@/hooks/useJobs'
import { useBackups } from '@/hooks/useBackups'
import type { DashboardStats } from '@/types'
import { DashboardController, DataService, DatabaseGateway } from '@/lib/dashboard'
import { supabase } from '@/lib/supabase'
import type { BackupProfile, Job } from '@/types'
import { formatDate, formatFileSize } from '@/lib/utils'
import { JobActionsPanel } from '@/components/dashboard/JobActionsPanel'

const WEEK_ORDER: Array<{ key: number; label: string }> = [
  { key: 1, label: 'Seg' },
  { key: 2, label: 'Ter' },
  { key: 3, label: 'Qua' },
  { key: 4, label: 'Qui' },
  { key: 5, label: 'Sex' },
  { key: 6, label: 'Sáb' },
  { key: 0, label: 'Dom' },
]

function computeDashboardStats(backups: ReturnType<typeof useBackups>['backups']): DashboardStats {
  const totalFiles = backups.length
  const totalSize = backups.reduce((sum, file) => sum + (file.file_size ?? 0), 0)
  const recentFiles = backups.slice(0, 5)

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  const uploadsByWeekday = new Map<number, number>()
  WEEK_ORDER.forEach(({ key }) => uploadsByWeekday.set(key, 0))
  const lastSevenDays = now - dayMs * 6

  for (const file of backups) {
    const uploadedAt = new Date(file.uploaded_at).getTime()
    if (Number.isNaN(uploadedAt)) continue
    if (uploadedAt >= lastSevenDays) {
      const weekday = new Date(uploadedAt).getDay()
      uploadsByWeekday.set(weekday, (uploadsByWeekday.get(weekday) ?? 0) + 1)
    }
  }

  const weeklyUploads = WEEK_ORDER.map(({ key, label }) => ({
    day: label,
    count: uploadsByWeekday.get(key) ?? 0,
  }))

  const fileTypeMap = new Map<string, { count: number; size: number }>()
  for (const file of backups) {
    const extension = file.filename.split('.').pop()?.toLowerCase() ?? 'outros'
    const entry = fileTypeMap.get(extension) ?? { count: 0, size: 0 }
    entry.count += 1
    entry.size += file.file_size ?? 0
    fileTypeMap.set(extension, entry)
  }
  const fileTypeDistribution = Array.from(fileTypeMap.entries())
    .map(([type, value]) => ({ type: type.toUpperCase(), ...value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const last30Days = now - dayMs * 30
  const prev30DaysStart = now - dayMs * 60
  const uploadsLast30 = backups.filter((f) => {
    const ts = new Date(f.uploaded_at).getTime()
    return !Number.isNaN(ts) && ts >= last30Days
  }).length
  const uploadsPrev30 = backups.filter((f) => {
    const ts = new Date(f.uploaded_at).getTime()
    return !Number.isNaN(ts) && ts >= prev30DaysStart && ts < last30Days
  }).length

  const monthlyGrowth =
    uploadsPrev30 === 0
      ? uploadsLast30 > 0
        ? 100
        : 0
      : Math.round(((uploadsLast30 - uploadsPrev30) / uploadsPrev30) * 100)

  const averageFileSize = totalFiles > 0 ? totalSize / totalFiles : 0

  return {
    totalFiles,
    totalSize,
    recentFiles: recentFiles.map((file) => ({
      id: file.id,
      filename: file.filename,
      file_size: file.file_size,
      uploaded_at: file.uploaded_at,
      file_type: file.file_type,
    })),
    weeklyUploads,
    fileTypeDistribution,
    monthlyGrowth,
    averageFileSize,
  }
}

export default function Dashboard() {
  const { user } = useAuth()
  const controller = useMemo(
    () => new DashboardController(new DataService(new DatabaseGateway(supabase))),
    []
  )
  const [dashboardState, setDashboardState] = useState(controller.getState())
  const { devices, loading: loadingDevices, error: devicesError } = useDevices()
  const { backups, loading: loadingBackups, error: backupsError } = useBackups({ limit: 200 })
  const { jobs, loading: loadingJobs, error: jobsError } = useJobs({ limit: 10 })
  // Removido o uso de backup_profiles: o dashboard não depende mais dessa tabela.
  const profiles: BackupProfile[] = []

  useEffect(() => {
    let active = true
    if (!user?.id) {
      setDashboardState((prev) => ({ ...prev, loading: false, error: null }))
      return
    }

    controller.refresh(user.id).then((state) => {
      if (!active) return
      setDashboardState({ ...state })
    })

    return () => {
      active = false
    }
  }, [controller, user?.id])

  const loading = loadingDevices || loadingBackups || loadingJobs || dashboardState.loading
  const error = devicesError || backupsError || jobsError || dashboardState.error

  const stats = useMemo(() => computeDashboardStats(backups), [backups])
  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === 'pending' || job.status === 'running'),
    [jobs]
  )
  const recentJobs = useMemo(() => jobs.slice(0, 5), [jobs])

  const lastBackupDate = recentJobs.length > 0 && recentJobs[0].created_at 
    ? formatDate(recentJobs[0].created_at) 
    : null

  const getJobStatusBadge = (status: Job['status']): { label: string; className: string } => {
    switch (status) {
      case 'pending':
        return { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800' }
      case 'running':
        return { label: 'Em execução', className: 'bg-blue-100 text-blue-800' }
      case 'done':
        return { label: 'Concluído', className: 'bg-green-100 text-green-800' }
      case 'failed':
      default:
        return { label: 'Falhou', className: 'bg-red-100 text-red-800' }
    }
  }

  return (
    <main className="bg-[#F5F6F9] min-h-screen py-12">
      <div className="max-w-6xl mx-auto px-6 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#0067B8] border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>
        ) : (
          <>
            {/* Header + CTAs */}
            <Reveal>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  <div className="flex-1">
                    <h1 className="text-3xl font-bold text-[#1B1B1B] mb-2">Dashboard</h1>
                    <p className="text-[#737373] leading-relaxed">
                      Gerencie seus backups, dispositivos e restaurações de forma centralizada
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/personal/devices/register"
                      className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-[#0067B8] text-[#0067B8] font-semibold rounded-xl hover:bg-[#0067B8] hover:text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Registrar agente
                    </Link>
                    <Link
                      href="/personal/files"
                      className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-gray-300 text-[#737373] font-semibold rounded-xl hover:border-[#0067B8] hover:text-[#0067B8] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      Meus arquivos
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Métricas Rápidas */}
            <Reveal delayMs={50}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#737373] mb-2">Arquivos em backup</p>
                      <p className="text-3xl font-bold text-[#1B1B1B] mb-1">
                        {stats.totalFiles.toLocaleString('pt-BR')}
                      </p>
                      {lastBackupDate && (
                        <p className="text-xs text-[#737373]">Último backup em {lastBackupDate}</p>
                      )}
                    </div>
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#0067B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                  {stats.totalFiles === 0 && (
                    <div className="mt-3 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs font-medium text-yellow-800">Sem backups ainda</p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#737373] mb-2">Volume total</p>
                      <p className="text-3xl font-bold text-[#1B1B1B] mb-1">
                        {formatFileSize(stats.totalSize)}
                      </p>
                      <p className="text-xs text-[#737373]">Média: {formatFileSize(stats.averageFileSize)}/arquivo</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#737373] mb-2">Crescimento mensal</p>
                      <p className="text-3xl font-bold text-[#1B1B1B] mb-1">
                        {stats.monthlyGrowth > 0 ? '+' : ''}{stats.monthlyGrowth}%
                      </p>
                      <p className="text-xs text-[#737373]">{activeJobs.length} jobs ativos</p>
                    </div>
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${stats.monthlyGrowth >= 0 ? 'from-green-100 to-green-50' : 'from-red-100 to-red-50'} flex items-center justify-center`}>
                      <svg className={`w-6 h-6 ${stats.monthlyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={stats.monthlyGrowth >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Agenda de Jobs + Dispositivos */}
            <Reveal delayMs={100}>
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Agenda de Jobs */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-[#1B1B1B]">Agenda de Jobs</h2>
                    <span className="px-3 py-1 bg-blue-50 text-[#0067B8] text-sm font-semibold rounded-full">
                      {activeJobs.length} ativos
                    </span>
                  </div>

                  {recentJobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-[#1B1B1B] mb-2">Nenhum job agendado</h3>
                      <p className="text-sm text-[#737373] mb-4">Crie seu primeiro backup automático</p>
                      <button
                        onClick={() => document.getElementById('backup-section')?.scrollIntoView({ behavior: 'smooth' })}
                        className="px-5 py-2.5 bg-[#0067B8] text-white font-semibold rounded-xl hover:bg-[#005A9F] transition-colors"
                      >
                        Criar primeiro job
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentJobs.map((job) => {
                        const badge = getJobStatusBadge(job.status)
                        return (
                          <div key={job.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:border-[#0067B8] transition-colors">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                job.status === 'running' ? 'bg-blue-100' : 
                                job.status === 'done' ? 'bg-green-100' : 
                                job.status === 'failed' ? 'bg-red-100' : 'bg-yellow-100'
                              }`}>
                                <svg className={`w-5 h-5 ${
                                  job.status === 'running' ? 'text-blue-600' : 
                                  job.status === 'done' ? 'text-green-600' : 
                                  job.status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="font-semibold text-[#1B1B1B] text-sm">{job.kind}</h3>
                                <p className="text-xs text-[#737373]">
                                  {job.created_at ? formatDate(job.created_at) : '—'}
                                </p>
                              </div>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Dispositivos */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-[#1B1B1B]">Dispositivos</h2>
                    <Link
                      href="/personal/devices/register"
                      className="p-2 rounded-lg border border-gray-200 hover:border-[#0067B8] hover:bg-blue-50 transition-colors"
                      title="Registrar dispositivo"
                    >
                      <svg className="w-4 h-4 text-[#0067B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </Link>
                  </div>

                  {devices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[#1B1B1B] mb-1">Nenhum dispositivo</p>
                      <p className="text-xs text-[#737373] mb-3">Registre um agente para começar</p>
                      <Link
                        href="/personal/devices/register"
                        className="text-xs font-semibold text-[#0067B8] hover:underline"
                      >
                        Registrar agora
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {devices.map((device) => {
                        const isOnline = device.last_seen_at && 
                          new Date().getTime() - new Date(device.last_seen_at).getTime() < 5 * 60 * 1000
                        return (
                          <div key={device.id} className="p-4 border border-gray-100 rounded-xl hover:border-[#0067B8] transition-colors">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-[#737373]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <h3 className="font-semibold text-[#1B1B1B] text-sm">
                                  {device.name ?? device.id.substring(0, 12)}
                                </h3>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {isOnline ? 'Online' : 'Offline'}
                              </span>
                            </div>
                            <p className="text-xs text-[#737373]">
                              Último contato: {device.last_seen_at ? formatDate(device.last_seen_at) : 'Nunca'}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </Reveal>

            {/* Ações (Backup / Restauração) */}
            <Reveal delayMs={150}>
              <div id="backup-section">
                <JobActionsPanel devices={devices} profiles={profiles} />
              </div>
            </Reveal>
          </>
        )}
      </div>
    </main>
  )
}
