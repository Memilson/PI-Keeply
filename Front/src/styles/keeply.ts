// Keeply Design System - Tokens + CSS Utility Classes (Tailwind-style)
const accent = 'var(--accent,#0067B8)'
const accentSoft = 'var(--accent-soft,#E8F2FB)'
const accentHover = 'var(--accent-strong,#005A9F)'
const accentActive = 'var(--accent-strong,#0B5CAB)'
const bg = 'var(--bg,#F8FAFC)'
const bgSoft = 'var(--surface-soft,#F6F8FB)'
const surface = 'var(--surface,#FFFFFF)'
const surfaceSubtle = 'var(--surface-soft,#F6F8FB)'
const border = 'var(--border,#E2E8F0)'
const borderStrong = 'var(--border-strong,#CBD5E1)'
const textPrimary = 'var(--fg,#0F172A)'
const textSecondary = 'var(--muted,#475569)'
const textMuted = 'var(--muted-soft,#94A3B8)'

export const keeplyStyles = {
  // ==== CORES BÁSICAS ====
  colors: {
    primary: accent,
    primarySoft: accentSoft,
    primaryHover: accentHover,
    primaryActive: accentActive,

    accent: 'var(--success,#107C10)',

    background: bg,
    backgroundSoft: bgSoft,
    surface,
    surfaceSubtle,

    borderSubtle: border,
    borderStrong,

    textPrimary,
    textSecondary,
    textMuted,
    textOnPrimary: '#FFFFFF',

    // Estados
    success: 'var(--success,#107C10)',
    successSoft: 'var(--success-soft,#E5F9E5)',

    warning: 'var(--warning,#FFB900)',
    warningSoft: 'var(--warning-soft,#FFF7E5)',

    danger: 'var(--danger,#D13438)',
    dangerSoft: 'var(--danger-soft,#FDE7E9)',

    info: 'var(--info,#0178D4)',
    infoSoft: 'var(--info-soft,#E5F3FF)',
  },

  // ==== LAYOUT ====
  layout: {
    container: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
    section: 'py-10 sm:py-12 lg:py-16',
    sectionNarrow: 'max-w-3xl mx-auto',
    stackVertical: 'flex flex-col gap-4',
    stackHorizontal: 'flex items-center gap-3',
  },

  // ==== TIPOGRAFIA ====
  fontFamily: {
    fontFamily:
      'Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },

  typography: {
    h1: `text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-[${textPrimary}]`,
    h2: `text-2xl sm:text-3xl font-semibold tracking-tight text-[${textPrimary}]`,
    h3: `text-xl sm:text-2xl font-semibold text-[${textPrimary}]`,
    h4: `text-lg font-semibold text-[${textPrimary}]`,

    body: `text-sm sm:text-base text-[${textSecondary}] leading-relaxed`,
    bodyStrong: `text-sm sm:text-base text-[${textPrimary}] leading-relaxed font-medium`,
    caption: `text-xs text-[${textSecondary}]`,
    overline: `text-[11px] font-semibold uppercase tracking-[0.14em] text-[${textSecondary}]`,
    link: `text-[${accent}] hover:text-[${accentHover}] underline-offset-4 hover:underline`,
  },

  // ==== ESPAÇAMENTO, RAIO E SOMBRA ====
  spacing: {
    xs: 'p-2',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
    xl: 'p-8',
  },

  radius: {
    subtle: 'rounded-lg',
    sm: 'rounded-xl',
    md: 'rounded-2xl',
    lg: 'rounded-3xl',
    pill: 'rounded-full',
  },

  shadow: {
    none: 'shadow-none',
    sm: 'shadow-sm',
    md: 'shadow-lg shadow-slate-200/70',
    lg: 'shadow-[0_18px_45px_rgba(148,163,184,0.35)]',
    focus: `ring-2 ring-[${accent}] ring-offset-1 ring-offset-white`,
  },

  // ==== COMPONENTES ====

  // Cards / superfícies
  card: {
    base: 'bg-white border border-slate-200 rounded-2xl shadow-[0_18px_45px_rgba(148,163,184,0.18)]',
    interactive:
      'bg-white border border-slate-200 rounded-2xl shadow-lg shadow-slate-200/60 hover:-translate-y-0.5 hover:shadow-[0_24px_55px_rgba(148,163,184,0.28)] hover:border-[#0067B8]/50 transition-all duration-200 cursor-pointer',
    elevated:
      'bg-white border border-slate-200 rounded-2xl shadow-lg shadow-slate-200/60 hover:shadow-[0_24px_55px_rgba(148,163,184,0.28)] transition-shadow duration-200',
    sectionHeader:
      'flex items-center justify-between mb-4 border-b border-slate-200 pb-3',
    padding: {
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },

  // Botões
  button: {
    base: `inline-flex items-center justify-center font-semibold rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[${accent}] disabled:opacity-60 disabled:cursor-not-allowed text-sm shadow-[0_10px_35px_rgba(0,103,184,0.15)] transition-all duration-150`,

    primary: `inline-flex items-center justify-center px-6 py-3 bg-[${accent}] text-white rounded-full hover:bg-[${accentHover}] active:bg-[${accentActive}]`,
    secondary: `inline-flex items-center justify-center px-6 py-3 border border-[${accent}] text-[${accent}] bg-white rounded-full hover:bg-[${accentSoft}] active:bg-[#CCE4F7]`,
    ghost:
      'inline-flex items-center justify-center px-4 py-2 text-[#475569] rounded-full hover:bg-[#E8F2FB] active:bg-[#CCE4F7]',

    danger:
      'inline-flex items-center justify-center px-6 py-3 bg-[#D13438] text-white rounded-full hover:bg-[#A4262C] active:bg-[#8E1921]',

    subtle: `inline-flex items-center justify-center px-4 py-2 bg-transparent text-[${accent}] rounded-full hover:bg-[${accentSoft}] active:bg-[#CCE4F7]`,

    sizes: {
      sm: 'h-9 px-4 text-xs',
      md: 'h-11 px-5 text-sm',
      lg: 'h-12 px-6 text-base',
      icon: 'h-10 w-10 p-0',
    },
  },

  // Inputs / campos
  input: {
    base: `w-full px-4 py-3 border border-slate-200 rounded-xl text-[${textPrimary}] bg-white placeholder:text-[#94A3B8] shadow-sm focus:outline-none focus:border-[${accent}] focus:ring-2 focus:ring-[${accent}] focus:ring-offset-0`,
    invalid:
      'w-full px-4 py-3 border border-[#D13438] rounded-xl text-[#0F172A] bg-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#A4262C] focus:ring-2 focus:ring-[#A4262C] focus:ring-offset-0',
    disabled:
      'w-full px-4 py-3 border border-slate-100 rounded-xl text-slate-500 bg-slate-50 cursor-not-allowed',
    label: 'block text-sm font-medium text-[#0F172A] mb-1',
    helpText: 'mt-1 text-xs text-[#475569]',
    errorText: 'mt-1 text-xs text-[#D13438]',
  },

  // Badges / status pills
  badge: {
    base: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
    neutral:
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700',
    success:
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#E5F9E5] text-[#107C10]',
    warning:
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#FFF7E5] text-[#8E562E]',
    danger:
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#FDE7E9] text-[#A4262C]',
    info: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#E5F3FF] text-[#0178D4]',
  },

  // Navegação
  nav: {
    topBar: 'w-full border-b border-gray-200 bg-white',
    topBarInner:
      'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-14 items-center justify-between',
    menuItem: `inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#475569] hover:text-[${accent}] hover:bg-[${accentSoft}] rounded-full transition-colors duration-150`,
    menuItemActive: `inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-[${accent}] bg-[${accentSoft}] rounded-full`,
  },

  // Ícones
  icon: {
    primary: `w-5 h-5 text-[${accent}]`,
    white: 'w-5 h-5 text-white',
    secondary: 'w-5 h-5 text-[#737373]',
    danger: 'w-5 h-5 text-[#D13438]',
    success: 'w-5 h-5 text-[#107C10]',
  },

  // Estados genéricos
  states: {
    loading: `animate-spin rounded-full h-6 w-6 border-2 border-[${accent}] border-t-transparent`,
    hoverable:
      'transition-all duration-200 hover:shadow-md hover:border-[#0067B8]',
    focusRing: `focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[${accent}]`,
  },

  // ==== ANIMAÇÕES / TRANSIÇÕES ====
  animation: {
    reveal: 'transition-all duration-500 ease-out',
    slideUpInitial: 'transform translate-y-4 opacity-0',
    slideUpFinal: 'transform translate-y-0 opacity-100',
    fadeIn:
      'transition-opacity duration-300 ease-out opacity-0 data-[show=true]:opacity-100',
  },
}

// Utility functions
export const getButtonClass = (
  variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' = 'primary',
  size: 'sm' | 'md' | 'lg' | 'icon' = 'md',
) => {
  const base = keeplyStyles.button.base
  const variantClass = keeplyStyles.button[variant]
  const sizeClass = keeplyStyles.button.sizes[size]

  return [base, variantClass, sizeClass].join(' ')
}
