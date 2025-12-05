import type { SVGProps } from 'react'

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 13l3 3 7-7" />
  </svg>
)

export const ArrowRightIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const CloudSyncIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10 6H6a2 2 0 00-2 2v8a2 2 0 002 2h4m4-12h4a2 2 0 012 2v3m-6 7h6m-3-3v6m-6-4l-3-3m0 0l-3 3m3-3v12"
    />
  </svg>
)

export const HistoryIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2 2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 118 8" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h4m-4 0V8" />
  </svg>
)
