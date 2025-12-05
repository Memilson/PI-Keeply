'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface RevealProps {
  children: ReactNode
  className?: string
  delayMs?: number
}

export const Reveal = ({ children, className = '', delayMs = 0 }: RevealProps) => {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delayMs)
        }
      },
      { threshold: 0.1 }
    )

    const current = ref.current
    if (current) observer.observe(current)

    return () => {
      if (current) observer.unobserve(current)
    }
  }, [delayMs])

  return <div ref={ref} className={cn('reveal', isVisible && 'fade-in-up', className)}>{children}</div>
}
