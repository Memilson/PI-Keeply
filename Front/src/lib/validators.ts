export const sanitizeDigits = (value: string) => value.replace(/\D/g, '')

export const isValidEmail = (email: string) => {
  const normalized = email.trim().toLowerCase()
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
  return emailRegex.test(normalized)
}

export const isStrongPassword = (password: string, email?: string, name?: string) => {
  if (password.length < 10 || password.length > 64) {
    return false
  }

  if (/\s/.test(password)) {
    return false
  }

  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)

  if (!hasUppercase || !hasLowercase || !hasNumber || !hasSymbol) {
    return false
  }

  const emailIdentifier = email?.split('@')[0]?.toLowerCase()
  const loweredPassword = password.toLowerCase()

  if (emailIdentifier && loweredPassword.includes(emailIdentifier)) {
    return false
  }

  if (name) {
    const nameTokens = name.toLowerCase().split(/\s+/).filter(Boolean)
    if (nameTokens.some((token) => token.length >= 3 && loweredPassword.includes(token))) {
      return false
    }
  }

  return true
}

export const isValidUsername = (username: string) => {
  const trimmed = username.trim()
  if (trimmed.length < 3 || trimmed.length > 30) {
    return false
  }
  return /^[a-zA-Z0-9_]+$/.test(trimmed)
}

export const isValidPhone = (phone: string) => {
  const digits = sanitizeDigits(phone)
  if (digits.length < 10 || digits.length > 11) {
    return false
  }
  if (/^(\d)\1+$/.test(digits)) {
    return false
  }
  return true
}

export const sanitizeCPF = (cpf: string) => sanitizeDigits(cpf)

export const isValidCPF = (cpf: string) => {
  const digits = sanitizeCPF(cpf)
  if (digits.length !== 11) {
    return false
  }
  if (/^(\d)\1{10}$/.test(digits)) {
    return false
  }

  const calcCheckDigit = (factor: number) => {
    let total = 0
    for (let i = 0; i < factor - 1; i += 1) {
      total += Number(digits[i]) * (factor - i)
    }
    const remainder = (total * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  const digit1 = calcCheckDigit(10)
  const digit2 = calcCheckDigit(11)

  return digit1 === Number(digits[9]) && digit2 === Number(digits[10])
}
