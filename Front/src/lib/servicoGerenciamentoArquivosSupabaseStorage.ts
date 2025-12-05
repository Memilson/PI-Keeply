import { supabase } from './supabase'
import type { BackupFile } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BUCKET_BACKUPS } from './constants'

const toError = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error
  return new Error(fallback)
}

export async function salvarMetadadosArquivoNoBanco(
  meta: Omit<BackupFile, 'id' | 'uploaded_at'>
): Promise<void> {
  console.warn('salvarMetadadosArquivoNoBanco: operação ignorada para o esquema atual.', {
    file_path: meta.file_path,
    file_size: meta.file_size,
  })
}

export async function uploadToStorage(
  path: string,
  file: File,
  client: SupabaseClient = supabase
): Promise<void> {
  const { error } = await client.storage.from(BUCKET_BACKUPS).upload(path, file)
  if (error) throw toError(error, 'Erro ao enviar arquivo para o storage')
}
