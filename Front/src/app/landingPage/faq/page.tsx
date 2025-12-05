'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface SupportFAQ {
  id: number
  question: string
  answer: string
}

const supportFaq: SupportFAQ[] = [
  {
    id: 1,
    question: 'Não consigo fazer login. O que faço?',
    answer:
      'Confira se e-mail e senha estão corretos. Se ainda assim não entrar, use a opção “Esqueci minha senha” na tela de login. Se o erro continuar, envie um print para suporte@keeply.com informando o horário aproximado em que tentou acessar.',
  },
  {
    id: 2,
    question: 'O agente de backup aparece como offline.',
    answer:
      'Verifique se o computador está ligado e conectado à internet. Em seguida, abra o aplicativo Keeply e confira se está logado. Se continuar offline, reinicie o agente (ou o próprio computador) e aguarde alguns minutos.',
  },
  {
    id: 3,
    question: 'Meus backups não estão rodando.',
    answer:
      'Abra o app Keeply e veja se há algum alerta na tela inicial. Confirme se as pastas que você quer proteger ainda existem e se há espaço em disco. Caso veja mensagens de erro, copie o texto ou tire um print e envie para o suporte.',
  },
  {
    id: 4,
    question: 'Como peço ajuda para restaurar arquivos?',
    answer:
      'No painel, vá em “Restauração” e selecione o dispositivo e a data desejada. Se não tiver certeza de qual ponto escolher, descreva o que precisa (arquivo, pasta, dia aproximado) e mande para suporte@keeply.com que o time te orienta.',
  },
  {
    id: 5,
    question: 'Recebi uma cobrança que não reconheço.',
    answer:
      'Verifique se não há outros usuários da sua empresa usando o Keeply na mesma conta. Depois, envie o comprovante ou print da cobrança para o suporte informando o e-mail da conta. Assim, analisamos o histórico e ajustamos se for o caso.',
  },
  {
    id: 6,
    question: 'Como falo direto com o suporte?',
    answer:
      'Você pode enviar um e-mail para suporte@keeply.com com uma descrição simples do problema, prints de tela e, se possível, o horário aproximado em que aconteceu. No plano Pro e Equipes, respondemos em até 2h úteis.',
  },
]

export default function FAQSupport() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-10 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (user) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Suporte Keeply
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
            Perguntas frequentes de suporte
          </h1>
          <p className="text-sm text-slate-600">
            Aqui estão as dúvidas mais comuns sobre acesso, agente de backup,
            restauração e cobranças.
          </p>
        </header>

        <section className="space-y-3">
          {supportFaq.map((item) => (
            <details
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
            >
              <summary className="cursor-pointer list-none font-medium text-slate-900">
                {item.question}
              </summary>
              <div className="mt-2 text-slate-700">
                {item.answer}
              </div>
            </details>
          ))}
        </section>

        <footer className="pt-4 border-t border-slate-200 text-sm text-slate-600">
          <p>
            Não achou sua dúvida aqui? Envie uma mensagem para{' '}
            <a
              href="mailto:suporte@keeply.com"
              className="text-sky-700 font-medium hover:underline"
            >
              suporte@keeply.com
            </a>
            .
          </p>
        </footer>
      </main>
    </div>
  )
}
  