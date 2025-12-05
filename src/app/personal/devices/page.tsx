'use client'

import Link from 'next/link'
import { Reveal } from '@/components/UnifiedCommon'
import { useDevices } from '@/hooks/useDevices'
import { formatDate } from '@/lib/utils'

export default function DevicesPage() {
  const { devices, loading, error } = useDevices()

  return (
    <main className="bg-[#F5F6F9] min-h-screen py-12">
      <div className="max-w-6xl mx-auto px-6 space-y-8">
        <Reveal>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-[#1B1B1B] mb-2">Meus dispositivos</h1>
                <p className="text-[#737373]">Gerencie agentes e visualize status de conexão</p>
              </div>
              <Link
                href="/personal/devices/register"
                className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-[#0067B8] text-[#0067B8] font-semibold rounded-xl hover:bg-[#0067B8] hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Registrar dispositivo
              </Link>
            </div>
          </div>
        </Reveal>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl">{error}</div>
        )}

        <Reveal delayMs={100}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#1B1B1B]">Dispositivos</h2>
              <span className="px-3 py-1 bg-blue-50 text-[#0067B8] text-sm font-semibold rounded-full">
                {devices.length} ativo(s)
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#0067B8] border-top-transparent"></div>
              </div>
            ) : devices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-[#1B1B1B] mb-2">Nenhum dispositivo</h3>
                <p className="text-sm text-[#737373] mb-4">Registre um agente para começar</p>
                <Link
                  href="/personal/devices/register"
                  className="px-5 py-2.5 bg-[#0067B8] text-white font-semibold rounded-xl hover:bg-[#005A9F] transition-colors"
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
        </Reveal>
      </div>
    </main>
  )
}
