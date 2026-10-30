import * as React from 'react'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'outline'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success',
  warning: 'bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning',
  danger: 'bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger',
  outline: 'border border-border-base text-fg-muted',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-xs px-1.5 text-[11.5px] font-[600] leading-none',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export function Dot({ className }: { className?: string }) {
  return <i className={cn('h-1.5 w-1.5 rounded-full bg-current', className)} />
}
