'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Message = { kind: 'ok' | 'err'; text: string }
type AgentResponse = {
  agent?: {
    id: string
    device_id: string
    hostname: string | null
    os: string | null
    arch: string | null
    registered_at: string | null
    last_seen_at: string | null
  }
  created?: boolean
}

export default function RegisterDevicePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-[#737373]">Carregando...</div>}>
      <RegisterDeviceContent />
    </Suspense>
  )
}

function RegisterDeviceContent() {
  const searchParams = useSearchParams()
  const [deviceToken, setDeviceToken] = useState('')
  const [name, setName] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [agentInfo, setAgentInfo] = useState<AgentResponse['agent'] | null>(null)

  useEffect(() => {
    const fromUrl = searchParams.get('code') || searchParams.get('token')
    if (fromUrl) setDeviceToken(fromUrl)
  }, [searchParams])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) {
      setMessage({ kind: 'err', text: 'Por favor, faça login primeiro.' })
      return
    }
    if (!deviceToken.trim()) {
      setMessage({ kind: 'err', text: 'Digite o código do dispositivo.' })
      return
    }

    setSubmitting(true)
    setMessage(null)
    setAgentInfo(null)
    try {
      const res = await fetch('/api/devices/activate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activation_code: deviceToken.trim(),
          name: name.trim() || undefined,
        }),
      })

      const body = await res.json()
      if (!res.ok) {
        setMessage({ kind: 'err', text: body.error ?? 'Não foi possível adicionar o dispositivo.' })
        return
      }

      setAgentInfo(body.agent ?? null)
      setMessage({ kind: 'ok', text: 'Dispositivo adicionado! Agora ele fará backups automáticos.' })
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="bg-[#F5F6F9] min-h-screen py-12">
      <div className="max-w-6xl mx-auto px-6 space-y-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-[#1B1B1B] mb-2">Registrar dispositivo</h1>
              <p className="text-[#737373] leading-relaxed">
                Cole o código exibido no seu computador para ativar o agente e começar a fazer backups automáticos.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="text-sm font-semibold text-[#1B1B1B] mb-2 block">Código/Token do agente</span>
              <input
                value={deviceToken}
                onChange={(e) => setDeviceToken(e.target.value)}
                placeholder="device-id-ou-token"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none transition-colors"
                autoComplete="off"
                required
              />
              <p className="text-xs text-[#737373] mt-1.5">Você encontra esse código no app do agente</p>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#1B1B1B] mb-2 block">Nome opcional</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Notebook do João"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-[#0067B8] focus:ring-2 focus:ring-blue-50 focus:outline-none transition-colors"
                autoComplete="off"
              />
              <p className="text-xs text-[#737373] mt-1.5">Ajuda a identificar o dispositivo no dashboard</p>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-3.5 bg-[#0067B8] text-white font-semibold rounded-xl hover:bg-[#005A9F] transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Registrando...
                </span>
              ) : 'Registrar dispositivo'}
            </button>

            {message && (
              <div
                className={`px-5 py-4 rounded-xl border ${
                  message.kind === 'ok'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">{message.text}</span>
                </div>
              </div>
            )}

            {!token && (
              <div className="px-5 py-4 rounded-xl border bg-yellow-50 border-yellow-200 text-yellow-800">
                Você precisa estar autenticado. Faça login e tente novamente.
              </div>
            )}
          </form>
        </div>

        {agentInfo && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#1B1B1B]">Resumo do agente</h2>
              <span className="px-3 py-1 bg-blue-50 text-[#0067B8] text-sm font-semibold rounded-full">Registrado</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm text-[#1B1B1B]">
              <div className="p-3 border border-gray-100 rounded-xl"><span className="text-[#737373]">ID:</span> {agentInfo.id}</div>
              <div className="p-3 border border-gray-100 rounded-xl"><span className="text-[#737373]">Device ID:</span> {agentInfo.device_id}</div>
              <div className="p-3 border border-gray-100 rounded-xl"><span className="text-[#737373]">Hostname:</span> {agentInfo.hostname ?? '—'}</div>
              <div className="p-3 border border-gray-100 rounded-xl"><span className="text-[#737373]">OS:</span> {agentInfo.os ?? '—'}</div>
              <div className="p-3 border border-gray-100 rounded-xl"><span className="text-[#73773]">Arch:</span> {agentInfo.arch ?? '—'}</div>
              <div className="p-3 border border-gray-100 rounded-xl"><span className="text-[#737373]">Registrado em:</span> {agentInfo.registered_at ?? '—'}</div>
              <div className="p-3 border border-gray-100 rounded-xl sm:col-span-2"><span className="text-[#737373]">Último contato:</span> {agentInfo.last_seen_at ?? '—'}</div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
