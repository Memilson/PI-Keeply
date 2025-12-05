"use client"

import Link from 'next/link'
import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'

import { keeplyStyles } from '@/styles/keeply'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

type ButtonProps = {
  variant?: ButtonVariant
  className?: string
  children: ReactNode
  href?: string
} & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({
  variant = 'primary',
  className = '',
  children,
  href,
  ...props
}: ButtonProps): ReactElement {
  const base = keeplyStyles.button[variant]
  const classes = `${base} ${className}`.trim()

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  )
}

interface AccordionItemProps {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  disabled?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AccordionItem({
  title,
  children,
  defaultOpen,
  disabled,
  onOpenChange,
}: AccordionItemProps) {
  const [open, setOpen] = useState(!!defaultOpen)
  const panelId = useId()

  const toggle = () => {
    if (disabled) return
    setOpen((current) => {
      const next = !current
      onOpenChange?.(next)
      return next
    })
  }

  return (
    <div
      className={cx(
        'rounded-2xl border border-[#e5e7eb] bg-white shadow-sm transition',
        open && 'shadow-md shadow-[#1f4bff1a]'
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cx(
          'flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-sm font-semibold text-[#111827] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f4bff]/40',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className="inline-flex items-center gap-2">{title}</span>
        <span
          className={cx(
            'inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1f4bff]/10 text-[#1f4bff] transition-transform',
            open ? 'rotate-180' : ''
          )}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        className={cx(
          'grid transition-all duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden border-t border-[#e5e7eb] px-5 py-5">{children}</div>
      </div>
    </div>
  )
}

interface AccordionProps {
  children: ReactNode
}

export function Accordion({ children }: AccordionProps) {
  return <div className="space-y-4">{children}</div>
}

interface ContainerProps {
  className?: string
  children: ReactNode
}

export function Container({ className = '', children }: ContainerProps): ReactElement {
  return <div className={`${keeplyStyles.layout.container} ${className}`.trim()}>{children}</div>
}
