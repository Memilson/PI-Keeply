'use client'

import { Reveal } from './Reveal'
import { RatingStars } from './Rating'

export type Testimonial = {
  name: string
  role: string
  content: string
  avatar: string
}

type TestimonialCardProps = Testimonial & {
  delayMs?: number
}

export const TestimonialCard = ({ name, role, content, avatar, delayMs = 0 }: TestimonialCardProps) => (
  <Reveal delayMs={delayMs}>
    <div className="group bg-gradient-to-br from-neutral-50 to-white p-8 rounded-2xl border border-neutral-200 hover:border-neutral-300 transition-all duration-300 hover:shadow-lg relative">
      <div className="flex items-center mb-6">
        <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-lg mr-4">
          {avatar}
        </div>
        <div>
          <h4 className="font-semibold text-neutral-900">{name}</h4>
          <p className="text-sm text-neutral-600">{role}</p>
        </div>
      </div>
      <p className="text-neutral-700 leading-relaxed italic">&ldquo;{content}&rdquo;</p>
      <div className="mt-4">
        <RatingStars label={`Avaliação de ${name}`} />
      </div>
    </div>
  </Reveal>
)

const testimonials: Testimonial[] = [
  {
    name: 'Maria Silva',
    role: 'Empreendedora',
    content: 'O Keeply simplificou meus backups. Sei onde tudo está e não preciso me preocupar com perda de arquivos.',
    avatar: 'M',
  },
  {
    name: 'João Santos',
    role: 'Líder técnico',
    content: 'Integra fácil com o que já uso e avisa quando algo precisa de atenção. Me economiza tempo todo dia.',
    avatar: 'J',
  },
  {
    name: 'Ana Costa',
    role: 'Desenvolvedora',
    content: 'A interface é direta e clara. Consigo restaurar arquivos sem depender de ninguém.',
    avatar: 'A',
  },
]

export const TestimonialsSection = () => (
  <section className="px-6 py-20 bg-white">
    <div className="max-w-7xl mx-auto">
      <Reveal>
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4 tracking-tight">O que nossos clientes dizem</h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">Experiências reais de quem usa o Keeply no dia a dia</p>
        </div>
      </Reveal>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {testimonials.map((t, index) => (
          <TestimonialCard key={t.name} {...t} delayMs={index * 200} />
        ))}
      </div>
    </div>
  </section>
)
