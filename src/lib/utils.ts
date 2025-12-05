// Utilitários compartilhados de formatação

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)
  return `${parseFloat(value.toFixed(2))} ${sizes[i]}`
}

export function formatDate(dateInput: string | number | Date, locale = 'pt-BR'): string {
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Formatações de input (não alteram validação, apenas aparência enquanto digita)
export function formatCPFInput(value: string): string {
  const digits = (value || '').replace(/\D/g, '').slice(0, 11)
  const part1 = digits.slice(0, 3)
  const part2 = digits.slice(3, 6)
  const part3 = digits.slice(6, 9)
  const part4 = digits.slice(9, 11)
  let out = part1
  if (part2) out += `.${part2}`
  if (part3) out += `.${part3}`
  if (part4) out += `-${part4}`
  return out
}

export function formatPhoneBRInput(value: string): string {
  const digits = (value || '').replace(/\D/g, '').slice(0, 11)
  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  if (!ddd) return digits
  if (rest.length <= 4) {
    return `(${ddd}) ${rest}`.trim()
  }
  if (digits.length === 11) {
    // (XX) 9XXXX-XXXX
    const p1 = rest.slice(0, 5)
    const p2 = rest.slice(5)
    return `(${ddd}) ${p1}-${p2}`
  } else {
    // (XX) XXXX-XXXX
    const p1 = rest.slice(0, 4)
    const p2 = rest.slice(4)
    return `(${ddd}) ${p1}${p2 ? '-' + p2 : ''}`
  }
}

// Cartão de crédito - apenas formatação visual
export function formatCardNumberInput(value: string): string {
  const digits = (value || '').replace(/\D/g, '').slice(0, 19) // suporta até 19 para alguns BINs
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

export function formatCardExpiryInput(value: string): string {
  const digits = (value || '').replace(/\D/g, '').slice(0, 4)
  const mm = digits.slice(0, 2)
  const yy = digits.slice(2, 4)
  return yy ? `${mm}/${yy}` : mm
}

export function detectCardBrand(cardDigits: string): 'visa' | 'mastercard' | 'amex' | 'elo' | 'hipercard' | 'diners' | 'discover' | 'unknown' {
  const d = (cardDigits || '').replace(/\D/g, '')
  if (/^4\d{12,18}$/.test(d)) return 'visa'
  if (/^(5[1-5]|2[2-7])\d{14}$/.test(d)) return 'mastercard'
  if (/^3[47]\d{13}$/.test(d)) return 'amex'
  if (/^3(?:0[0-5]|[68]\d)\d{11}$/.test(d)) return 'diners'
  if (/^6(?:011|5\d{2})\d{12}$/.test(d)) return 'discover'
  // Heurísticas simples para Elo/Hipercard
  if (/^(4011|4312|4389|4514|4576|5041|5067|509|6277|6363|650|651|652)/.test(d)) return 'elo'
  if (/^606282|^3841(?:[046]\d{2}|(?:2[0-9]|3[0-9]))/.test(d)) return 'hipercard'
  return 'unknown'
}

// Compose className strings de forma segura e concisa (sem dependências externas)
export function cn(
  ...classes: Array<string | undefined | null | false>
): string {
  return classes.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}
