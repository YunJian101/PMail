import * as React from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-3 px-8 py-16 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-fg-subtle">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="text-[14px] font-[600] text-fg">{title}</p>
        {description ? (
          <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-fg-subtle">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-border-base bg-surface-2 px-1.5 py-px font-mono text-[10.5px] text-fg-subtle">
      {children}
    </kbd>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-[700] uppercase tracking-[0.1em] text-fg-subtle">
      {children}
    </span>
  )
}
