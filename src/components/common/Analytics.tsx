'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

interface GtagConfig {
  page_path?: string
  custom_parameter_1?: string
  custom_parameter_2?: string
  [key: string]: unknown
}

declare global {
  interface Window {
    gtag: (command: string, target: string, config?: GtagConfig) => void
  }
}

export function Analytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pathWithQuery = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

  useEffect(() => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', process.env.NEXT_PUBLIC_GA_ID || '', {
        page_path: pathWithQuery,
      })
    }
  }, [pathWithQuery])

  if (!process.env.NEXT_PUBLIC_GA_ID) {
    return null
  }

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
              page_path: window.location.pathname,
            });
          `,
        }}
      />
    </>
  )
}
