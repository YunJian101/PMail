import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** 左侧图标插槽（会留出内边距） */
  leading?: React.ReactNode
  /** 右侧内容插槽（例如「显示」按钮、快捷键提示） */
  trailing?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leading, trailing, ...props },
  ref,
) {
  const field = (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-sm border border-border-base bg-surface px-3 text-[13.5px] text-fg',
        'placeholder:text-fg-subtle transition-[border-color,box-shadow] duration-150',
        'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        leading && 'pl-9',
        trailing && 'pr-16',
        className,
      )}
      {...props}
    />
  )

  if (!leading && !trailing) return field

  return (
    <div className="relative flex items-center">
      {leading ? (
        <span className="pointer-events-none absolute left-3 flex text-fg-subtle">{leading}</span>
      ) : null}
      {field}
      {trailing ? (
        <span className="absolute right-2.5 flex items-center gap-1 text-xs text-fg-subtle">
          {trailing}
        </span>
      ) : null}
    </div>
  )
})

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-sm border border-border-base bg-surface px-3 py-2 text-[13.5px] text-fg',
        'placeholder:text-fg-subtle transition-[border-color,box-shadow] duration-150',
        'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)]',
        className,
      )}
      {...props}
    />
  )
})

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-[12.5px] font-[600] text-fg-muted', className)}
      {...props}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4', className)}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-[12px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  )
}
