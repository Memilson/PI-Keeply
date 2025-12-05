'use client'
// Componente JobActionsPanel para criar backups e restaurações

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { supabase } from '@/lib/supabase'
import type { BackupProfile, Device, JobKind } from '@/types'

export interface JobActionsPanelProps {
  devices: Device[]
  profiles?: BackupProfile[]
}

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

type ManifestRow = {
  id: string
  root: string
  timestamp: string
}

export function JobActionsPanel({ devices }: JobActionsPanelProps): ReactElement {
  const [selectedDevice, setSelectedDevice] = useState<string>(devices[0]?.id ?? '')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [quickSource, setQuickSource] = useState<string>('full')
  const [storageBackend, setStorageBackend] = useState<'s3' | 'local'>('s3')
  const [destPath, setDestPath] = useState<string>('')
  const [scheduleTime, setScheduleTime] = useState<string>('')
  const [frequency, setFrequency] = useState<'once' | 'daily' | 'weekly'>('once')
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [restoreManifestId, setRestoreManifestId] = useState<string>('')
  const [restoreRootPath, setRestoreRootPath] = useState<string>('')
  const [restoreDestPath, setRestoreDestPath] = useState<string>('')
  const [manifests, setManifests] = useState<Array<{ id: string; root: string; created_at: string }>>([])
  const [isBackupExpanded, setIsBackupExpanded] = useState<boolean>(true)
  const [isRestoreExpanded, setIsRestoreExpanded] = useState<boolean>(false)
  const [manualPath, setManualPath] = useState<string>('')

  useEffect(() => {
    if (!selectedDevice && devices.length > 0) {
      setSelectedDevice(devices[0].id)
    }
  }, [devices, selectedDevice])

  useEffect(() => {
    const loadManifests = async () => {
      try {
        const { data } = await supabase
          .from('manifests')
          .select('id, root, timestamp')
          .order('timestamp', { ascending: false })
          .limit(10)
        if (data) {
          const mapped = data.map((m: ManifestRow) => ({
            id: m.id,
            root: m.root,
            created_at: m.timestamp,
          }))
          setManifests(mapped)
          if (mapped.length > 0) {
            setRestoreManifestId((prev) => prev || mapped[0].id)
            setRestoreRootPath((prev) => prev || mapped[0].root)
          }
        }
      } catch {
        // ignore errors silently
      }
    }
    void loadManifests()
  }, [])

  const deviceOptions = useMemo(
    () => devices.map((device) => ({ value: device.id, label: device.name ?? device.id })),
    [devices]
  )

  const ensureSelections = () => {
    if (!selectedDevice) {
      throw new Error('Selecione um device para executar o job.')
    }
  }

  const resolveSrcPath = () => {
    switch (quickSource) {
      case 'full':
        return '/'
      case 'custom':
        return manualPath.trim()
      default:
        return manualPath.trim()
    }
  }

  const runJob = async (kind: JobKind, payload: Record<string, unknown>, jobType: 'BACKUP' | 'RESTORE' = 'BACKUP') => {
    setIsSubmitting(true)
    setFeedback(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        throw new Error('Sessão expirada. Faça login novamente.')
      }

      const res = await fetch('/api/agent-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: selectedDevice,
          device_id: selectedDevice,
          type: jobType,
          payload: {
            kind,
            ...payload,
          },
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        const msg = body?.error ?? 'Não foi possível criar a tarefa.'
        throw new Error(msg)
      }
      setFeedback({ type: 'success', message: 'Tarefa enviada para o agente.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível criar a tarefa.'
      setFeedback({ type: 'error', message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRunBackup = async () => {
    try {
      ensureSelections()
      const srcPath = resolveSrcPath()
      if (!srcPath) {
        throw new Error('Informe uma origem (perfil, seleção rápida ou manual).')
      }

      await runJob('run_backup', {
        mode: 'auto',
        src_path: srcPath,
        storage_backend: storageBackend,
        dest_path: storageBackend === 'local' ? destPath.trim() : null,
        schedule_time: scheduleTime || null,
        schedule_frequency: frequency,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar job.'
      setFeedback({ type: 'error', message })
    }
  }

  const handleRunRestore = async () => {
    try {
      ensureSelections()
      const manifestId = restoreManifestId.trim() || manifests[0]?.id || ''
      const rootPath = restoreRootPath.trim() || manifests[0]?.root || ''
      if (!manifestId) throw new Error('Nenhum manifest encontrado. Informe um manifest_id.')
      if (!rootPath) throw new Error('Nenhum root encontrado. Informe root_path.')
      if (!restoreDestPath.trim()) throw new Error('Informe o destino local para restaurar.')

      await runJob(
        'restore',
        {
          manifest_id: manifestId,
          root_path: rootPath,
          dest_path: restoreDestPath.trim(),
          storage_backend: storageBackend,
          dest_local_path: storageBackend === 'local' ? destPath.trim() : null,
        },
        'RESTORE'
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar job de restauração.'
      setFeedback({ type: 'error', message })
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`px-5 py-4 rounded-xl border ${
            feedback.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">{feedback.message}</span>
          </div>
        </div>
      )}

      {/* Seleção de Device */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <label className="block">
          <span className="text-sm font-semibold text-[#1B1B1B] mb-2 block">Dispositivo</span>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none transition-colors"
          >
            {deviceOptions.length === 0 && <option value="">Nenhum device registrado</option>}
            {deviceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-[#737373] mt-1.5">Selecione o dispositivo que executará a ação</p>
        </label>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Card de Backup */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => setIsBackupExpanded(!isBackupExpanded)}
            className="w-full flex items-center justify-between p-6 hover:bg-[#F8F9FA] transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-[#1B1B1B]">Backup</h2>
                <p className="text-sm text-[#737373]">Backup rápido deste dispositivo</p>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-[#737373] transition-transform flex-shrink-0 ${isBackupExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isBackupExpanded && (
            <div className="px-6 pb-6 space-y-5 border-t border-gray-100">
              <div className="pt-6 space-y-5">
                {/* Origem / Destino */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#1B1B1B] uppercase tracking-wide">Origem e Destino</h3>
                  <div className="grid gap-4">
                    <label className="block">
                      <span className="text-sm font-medium text-[#1B1B1B] mb-1.5 block">Origem</span>
                      <select
                        value={quickSource}
                        onChange={(e) => setQuickSource(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none"
                      >
                        <option value="full">Toda máquina</option>
                        <option value="custom">Pasta específica</option>
                      </select>
                      <p className="text-xs text-[#737373] mt-1">Escolha o escopo do backup</p>
                    </label>

                    {quickSource === 'custom' && (
                      <label className="block">
                        <span className="text-sm font-medium text-[#1B1B1B] mb-1.5 block">Caminho da pasta</span>
                        <input
                          type="text"
                          value={manualPath}
                          onChange={(e) => setManualPath(e.target.value)}
                          placeholder="/home/usuario/Downloads"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none"
                        />
                        <p className="text-xs text-[#737373] mt-1">Caminho absoluto da pasta</p>
                      </label>
                    )}

                    <label className="block">
                      <span className="text-sm font-medium text-[#1B1B1B] mb-1.5 block">Destino</span>
                      <select
                        value={storageBackend}
                        onChange={(e) => setStorageBackend(e.target.value as 's3' | 'local')}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none"
                      >
                        <option value="s3">Keeply Cloud</option>
                        <option value="local">Local (disco)</option>
                      </select>
                      <p className="text-xs text-[#737373] mt-1">Onde os arquivos serão armazenados</p>
                    </label>

                    {storageBackend === 'local' && (
                      <label className="block">
                        <span className="text-sm font-medium text-[#1B1B1B] mb-1.5 block">Caminho local</span>
                        <input
                          type="text"
                          value={destPath}
                          onChange={(e) => setDestPath(e.target.value)}
                          placeholder="/mnt/backup"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none"
                        />
                        <p className="text-xs text-[#737373] mt-1">Diretório de destino no disco local</p>
                      </label>
                    )}
                  </div>
                </div>

                {/* Agendamento */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-[#1B1B1B] uppercase tracking-wide">Agendamento</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-sm font-medium text-[#1B1B1B] mb-1.5 block">Horário</span>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none"
                      />
                      <p className="text-xs text-[#737373] mt-1">Opcional</p>
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-[#1B1B1B] mb-1.5 block">Frequência</span>
                      <select
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none"
                      >
                        <option value="once">Apenas agora</option>
                        <option value="daily">Diariamente</option>
                        <option value="weekly">Semanalmente</option>
                      </select>
                      <p className="text-xs text-[#737373] mt-1">Recorrência</p>
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRunBackup}
                  disabled={isSubmitting || devices.length === 0}
                  className="w-full px-6 py-3.5 bg-[#0067B8] text-white font-semibold rounded-xl hover:bg-[#005A9F] transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processando...
                    </span>
                  ) : 'Iniciar backup'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Card de Restauração */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => setIsRestoreExpanded(!isRestoreExpanded)}
            className="w-full flex items-center justify-between p-6 hover:bg-[#F8F9FA] transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-200">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-[#1B1B1B]">Restauração</h2>
                <p className="text-sm text-[#737373]">Restaurar arquivos de um backup existente</p>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-[#737373] transition-transform flex-shrink-0 ${isRestoreExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isRestoreExpanded && (
            <div className="px-6 pb-6 space-y-5 border-t border-gray-100">
              <div className="pt-6 space-y-5">
                <label className="block">
                  <span className="text-sm font-medium text-[#1B1B1B] mb-1.5 block">Manifest ID</span>
                  <select
                    value={restoreManifestId}
                    onChange={(e) => setRestoreManifestId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none"
                  >
                    {manifests.length === 0 && <option value="">Nenhum manifest encontrado</option>}
                    {manifests.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id.substring(0, 24)}... — {m.root}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[#737373] mt-1">Selecione o backup que deseja restaurar</p>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-[#1B1B1B] mb-1.5 block">Root do backup</span>
                  <input
                    type="text"
                    value={restoreRootPath}
                    onChange={(e) => setRestoreRootPath(e.target.value)}
                    placeholder="/home/usuario/Documentos"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none"
                  />
                  <p className="text-xs text-[#737373] mt-1">Caminho original do backup</p>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-[#1B1B1B] mb-1.5 block">Destino local</span>
                  <input
                    type="text"
                    value={restoreDestPath}
                    onChange={(e) => setRestoreDestPath(e.target.value)}
                    placeholder="/home/usuario/Restore"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none"
                  />
                  <p className="text-xs text-[#737373] mt-1">Onde os arquivos serão restaurados</p>
                </label>

                <button
                  type="button"
                  onClick={handleRunRestore}
                  disabled={isSubmitting || devices.length === 0}
                  className="w-full px-6 py-3.5 bg-[#10b981] text-white font-semibold rounded-xl hover:bg-[#059669] transition-all shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processando...
                    </span>
                  ) : 'Iniciar restauração'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
