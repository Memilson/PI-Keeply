export const faqItems = [
  { label: 'Começar agora', href: '/landingPage/faq#primeiros-passos' },
  { label: 'Segurança e privacidade', href: '/landingPage/faq#seguranca' },
  { label: 'Planos e preços', href: '/landingPage/pricing' },
  { label: 'Falar com a gente', href: '#contato' },
]

export const marketingLinks = [
  { label: 'Início', href: '/landingPage/landing' },
  { label: 'Como funciona', href: '/landingPage/recursos' },
  { label: 'Planos', href: '/landingPage/pricing', emphasis: true },
  { label: 'Ajuda', href: '/landingPage/faq', children: faqItems },
]
