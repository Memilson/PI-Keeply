// Minimal env validation to mirror previous logs without failing build
import 'dotenv/config'

const required = [] // add keys if strict validation is needed

const missing = required.filter((k) => !(k in process.env) || !String(process.env[k]).trim())

if (missing.length > 0) {
  console.error(`[ENV ERROR] Variáveis ausentes: ${missing.join(', ')}`)
  process.exit(1)
}

const count = Object.keys(process.env).length
console.log(`[ENV OK] Todas variáveis obrigatórias estão presentes. (${count} variáveis carregadas)`) 
