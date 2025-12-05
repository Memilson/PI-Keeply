export const heroMetrics = [
  { label: 'Backups feitos esta semana', value: '240' },
  { label: 'Versões por arquivo', value: 'até 30 dias' },
  { label: 'Restauração média', value: '2 min' },
]

export const featureHighlights = [
  {
    key: 'continuous-backup',
    title: 'Backup contínuo',
    description: 'Monitore pastas importantes e deixe o agente enviar tudo automaticamente para a nuvem ou HD.',
    icon: 'cloud-sync',
  },
  {
    key: 'history',
    title: 'Histórico e versões',
    description: 'Guarde versões antigas por até 30 dias e volte só o arquivo que você precisa, sem afetar o resto.',
    icon: 'history',
  },
  {
    key: 'restore',
    title: 'Restauração simples',
    description: 'Recupere um arquivo perdido ou refaça o backup completo da máquina com um fluxo guiado.',
    icon: 'check',
  },
]

export const dashboardHighlights = [
  { metric: 'Backups completos', value: '87', trend: 'últimos 30 dias' },
  { metric: 'Dispositivos protegidos', value: '2', trend: 'Notebook + Desktop' },
  { metric: 'Restauração média', value: '2 min', trend: 'para um único arquivo' },
]

export const backupTiers = [
  {
    title: 'Backup automático na nuvem',
    description: 'Selecione pastas e deixe o agente sincronizar com o Keeply Cloud automaticamente.',
    points: ['Versões por 30 dias', 'Criptografia em trânsito', 'Alertas de falha'],
  },
  {
    title: 'Nuvem + disco externo',
    description: 'Use HD externo para ter uma cópia local rápida e outra na nuvem para segurança extra.',
    points: ['Fallback local', 'Envio otimizado', 'Reutiliza dados já enviados'],
  },
  {
    title: 'Modo viagem',
    description: 'Pause uploads grandes e continue quando tiver wi-fi estável, sem perder o histórico.',
    points: ['Controle de banda', 'Retoma automático', 'Notificações simples'],
  },
]

export const ctaContent = {
  eyebrow: 'Sem complicar',
  title: 'Seus arquivos salvos no tempo em que você toma um café',
  description:
    'Instale o agente, escolha as pastas e pronto. O Keeply cuida do resto: nuvem, versões e restauração guiada.',
  primaryCta: { label: 'Começar agora', href: '/landingPage/register' },
  secondaryCta: { label: 'Ver perguntas frequentes', href: '/landingPage/faq' },
  helper: '14 dias gratuitos — Sem cartão de crédito — Ideal para seu PC, notebook e HD externo.',
}
