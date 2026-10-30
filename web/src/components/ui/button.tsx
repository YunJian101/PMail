import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

const VARIANTS: Record<Variant, string> = {
  primary:
    'border border-transparent bg-primary text-primary-fg shadow-[0_1px_2px_rgba(37,99,235,.35),inset_0_1px_0_rgba(255,255,255,.18)] hover:bg-primary-hover',
  secondary:
    'border border-border-base bg-surface text-fg shadow-e1 hover:bg-surface-3 hover:border-border-strong',
  outline: 'border border-border-strong bg-transparent text-fg hover:bg-surface-3',
  ghost: 'border border-transparent bg-transparent text-fg-muted hover:bg-surface-3 hover:text-fg',
  danger:
    'border border-transparent bg-danger text-white shadow-e1 hover:brightness-95',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-[13.5px]',
  icon: 'h-9 w-9',
  'icon-sm': 'h-8 w-8',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', asChild = false, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm font-[550]',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
})
