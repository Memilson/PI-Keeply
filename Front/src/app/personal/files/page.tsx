'use client'
// Página Meus Arquivos: listagem e gestão de arquivos com backup (linguagem para usuário final)

import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Reveal } from '@/components/UnifiedCommon'
import { FileIcon } from '@/components/UnifiedCommon'
import Link from 'next/link'
import { formatDate, formatFileSize } from '@/lib'
import { useBackups } from '@/hooks/useBackups'
import type { BackupFile } from '@/types'
import { DashboardContainer } from '@/components/dashboard/Container'
import { DashboardHeader } from '@/components/dashboard/Header'
import { keeplyStyles } from '@/styles/keeply'

const FILE_TYPE_OPTIONS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'image', label: 'Imagens' },
  { value: 'document', label: 'Documentos' },
  { value: 'video', label: 'Vídeos' },
  { value: 'audio', label: 'Áudios' },
  { value: 'archive', label: 'Arquivos compactados' },
]

function matchesFilter(file: BackupFile, searchTerm: string, filterType: string) {
  const matchesSearch = file.filename.toLowerCase().includes(searchTerm.toLowerCase())
  if (filterType === 'all') return matchesSearch

  const fileType = file.file_type || ''
  const extension = file.filename.split('.').pop()?.toLowerCase() || ''

  switch (filterType) {
    case 'image':
      return (
        matchesSearch &&
        (fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension))
      )
    case 'document':
      return (
        matchesSearch &&
        (fileType.includes('document') || fileType.includes('text') || ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(extension))
      )
    case 'video':
      return (
        matchesSearch &&
        (fileType.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(extension))
      )
    case 'audio':
      return (
        matchesSearch &&
        (fileType.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma'].includes(extension))
      )
    case 'archive':
      return matchesSearch && ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(extension)
    default:
      return matchesSearch
  }
}

export default function Files() {
  const { user } = useAuth()
  const {
    backups,
    loading,
    error,
    deleteBackup,
    refresh,
  } = useBackups({ limit: 500 })

  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date' | 'type'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [filterType, setFilterType] = useState<string>('all')

  const hasSelection = selectedFiles.length > 0

  const filteredFiles = useMemo(() => {
    const result = backups.filter((file) => matchesFilter(file, searchTerm, filterType))
    return result.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = a.filename.localeCompare(b.filename)
          break
        case 'size':
          comparison = (a.file_size ?? 0) - (b.file_size ?? 0)
          break
        case 'date':
          comparison = new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
          break
        case 'type':
          comparison = (a.file_type ?? '').localeCompare(b.file_type ?? '')
          break
        default:
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [backups, searchTerm, filterType, sortBy, sortOrder])

  const totalSize = useMemo(() => backups.reduce((sum, file) => sum + (file.file_size ?? 0), 0), [backups])

  const toggleSelection = (id: string) => {
    setSelectedFiles((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handleDelete = async (file: BackupFile) => {
    if (!confirm(`Tem certeza que deseja excluir "${file.filename}"?`)) {
      return
    }
    try {
      await deleteBackup(file.id)
      setSelectedFiles((prev) => prev.filter((id) => id !== file.id))
    } catch (err) {
      console.error('Erro ao excluir arquivo:', err)
      alert('Erro ao excluir arquivo. Tente novamente.')
    }
  }

  const handleBulkDelete = async () => {
    if (!hasSelection) return
    if (!confirm(`Excluir ${selectedFiles.length} arquivo(s)?`)) return

    for (const id of selectedFiles) {
      const file = backups.find((item) => item.id === id)
      if (!file) continue
      try {
        await deleteBackup(id)
      } catch (err) {
        console.error('Erro ao remover arquivo:', err)
      }
    }
    setSelectedFiles([])
  }

  return (
    <DashboardContainer>
      <DashboardHeader
        alignment="center"
        badge={(
          <div className="inline-flex items-center px-4 py-2 bg-[#F3F3F3] border border-gray-200 rounded-sm text-[#737373] text-sm font-medium">
            <div className="w-2 h-2 bg-[#0067B8] rounded-sm mr-2"></div>
            Arquivos protegidos e criptografados
          </div>
        )}
        title={(
          <Reveal>
            <h1 className="text-4xl font-bold text-[#1B1B1B] leading-tight">
              Meus arquivos
            </h1>
          </Reveal>
        )}
        description={(
          <Reveal>
            <p className="text-lg text-[#737373] max-w-2xl mx-auto leading-relaxed">
              Gerencie, organize e acesse todos os seus arquivos de backup de forma segura.
            </p>
          </Reveal>
        )}
      >
        <div className="space-y-6">
          <Reveal>
            <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-2xl font-bold text-[#0067B8] mb-1">{backups.length}</div>
                <div className="text-sm text-[#737373]">Arquivos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[#0067B8] mb-1">{formatFileSize(totalSize)}</div>
                <div className="text-sm text-[#737373]">Total usado</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[#0067B8] mb-1">{user?.email ?? 'Usuário'}</div>
                <div className="text-sm text-[#737373]">Conta</div>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setSearchTerm('')}
                className="inline-flex items-center px-6 py-3 border border-gray-300 text-[#737373] font-semibold rounded-sm hover:bg-white hover:border-[#0067B8] transition-colors duration-200"
              >
                Limpar filtros
              </button>
              <button
                onClick={() => refresh().catch((err) => console.error('Erro ao atualizar lista:', err))}
                className="inline-flex items-center px-6 py-3 border border-gray-300 text-[#737373] font-semibold rounded-sm hover:bg-white hover:border-[#0067B8] transition-colors duration-200"
              >
                Atualizar lista
              </button>
            </div>
          </Reveal>
        </div>
      </DashboardHeader>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="max-w-6xl mx-auto px-6 py-6">
            <Reveal>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-[#737373]">Tipo:</label>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="px-4 py-2.5 border border-gray-200 rounded-xl text-[#1B1B1B] focus:outline-none focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 bg-white text-sm"
                    >
                      {FILE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-[#737373]">Ordenar por:</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="px-4 py-2.5 border border-gray-200 rounded-xl text-[#1B1B1B] focus:outline-none focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 bg-white text-sm"
                    >
                      <option value="name">Nome</option>
                      <option value="size">Tamanho</option>
                      <option value="date">Data</option>
                      <option value="type">Tipo</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    className="text-sm text-[#0067B8] font-semibold hover:underline"
                  >
                    {sortOrder === 'asc' ? 'Ordem crescente' : 'Ordem decrescente'}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 w-full"
                    />
                    <svg className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      className={`px-3 py-2 border rounded-sm text-sm font-medium ${
                        viewMode === 'list'
                          ? 'border-[#0067B8] text-[#0067B8] bg-[#F0F6FF]'
                          : 'border-gray-200 text-[#737373]'
                      }`}
                      onClick={() => setViewMode('list')}
                    >
                      Lista
                    </button>
                    <button
                      className={`px-3 py-2 border rounded-sm text-sm font-medium ${
                        viewMode === 'grid'
                          ? 'border-[#0067B8] text-[#0067B8] bg-[#F0F6FF]'
                          : 'border-gray-200 text-[#737373]'
                      }`}
                      onClick={() => setViewMode('grid')}
                    >
                      Grade
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={hasSelection && selectedFiles.length === filteredFiles.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFiles(filteredFiles.map((file) => file.id))
                        } else {
                          setSelectedFiles([])
                        }
                      }}
                    />
                    <span className="text-sm text-[#737373]">Selecionar todos</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          {hasSelection && (
            <div className={`${keeplyStyles.card.base} p-5 rounded-2xl mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between`}>
              <span className="text-sm text-[#737373]">
                {selectedFiles.length} arquivo(s) selecionado(s)
              </span>
              <div className="flex space-x-3 mt-3 sm:mt-0">
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-2 bg-red-100 text-red-700 font-semibold text-sm rounded-xl hover:bg-red-200 transition-colors"
                >
                  Excluir selecionados
                </button>
                <button
                  onClick={() => setSelectedFiles([])}
                  className="px-4 py-2 border border-gray-200 text-[#737373] font-semibold text-sm rounded-xl hover:bg-white"
                >
                  Limpar seleção
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#0067B8] border-t-transparent"></div>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className={`${keeplyStyles.card.base} p-12 rounded-2xl text-center`}>
              <h3 className="text-xl font-bold text-[#1B1B1B] mb-3">Nenhum arquivo encontrado</h3>
              <p className="text-[#737373] mb-6">Ajuste os filtros ou aguarde os backups automáticos dos agentes.</p>
              <Link
                href="/personal/devices"
                className="inline-flex items-center px-6 py-3 bg-[#0067B8] text-white font-semibold rounded-xl hover:bg-[#005A9F] transition-colors shadow-lg shadow-blue-200"
              >
                Ver dispositivos
              </Link>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid md:grid-cols-3 gap-6">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className={`bg-white border rounded-2xl p-4 hover:shadow-md transition-shadow duration-200 ${
                    selectedFiles.includes(file.id) ? 'border-[#0067B8]' : 'border-gray-100'
                  }`}
                  onClick={() => toggleSelection(file.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <FileIcon fileType={file.file_type ?? ''} className="w-8 h-8" />
                      <div>
                        <h3 className="font-semibold text-[#1B1B1B] truncate max-w-[160px]">{file.filename}</h3>
                        <p className="text-xs text-[#737373]">{formatFileSize(file.file_size)}</p>
                      </div>
                    </div>
                    <input type="checkbox" checked={selectedFiles.includes(file.id)} readOnly />
                  </div>

                  <div className="text-sm text-[#737373] space-y-1">
                    <p>Upload em {formatDate(file.uploaded_at)}</p>
                    <p>Tipo: {file.file_type || '—'}</p>
                  </div>

                  <div className="mt-4 flex space-x-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(file)
                      }}
                      className="px-3 py-2 bg-red-100 text-red-700 font-semibold text-sm rounded-xl hover:bg-red-200"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={`${keeplyStyles.card.base} rounded-2xl overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-[#F8F9FA]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#737373] uppercase tracking-wider">Arquivo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#737373] uppercase tracking-wider">Tamanho</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#737373] uppercase tracking-wider">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#737373] uppercase tracking-wider">Upload</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-[#737373] uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredFiles.map((file) => (
                      <tr
                        key={file.id}
                        className={selectedFiles.includes(file.id) ? 'bg-[#F0F6FF]' : ''}
                        onClick={() => toggleSelection(file.id)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={selectedFiles.includes(file.id)}
                              onChange={() => toggleSelection(file.id)}
                              className="mr-3"
                            />
                            <div>
                              <div className="text-sm font-semibold text-[#1B1B1B]">{file.filename}</div>
                              <div className="text-xs text-[#737373]">ID: {file.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-[#1B1B1B]">
                          {formatFileSize(file.file_size)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-[#737373]">
                          {file.file_type || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-[#737373]">
                          {formatDate(file.uploaded_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(file)
                        }}
                        className="text-red-600 hover:underline"
                      >
                        Excluir
                      </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </main>
    </DashboardContainer>
  )
}
