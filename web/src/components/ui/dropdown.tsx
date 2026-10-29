import * as React from 'react'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dropdown = DropdownPrimitive.Root
export const DropdownTrigger = DropdownPrimitive.Trigger

export const DropdownContent = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(function DropdownContent({ className, align = 'end', sideOffset = 6, ...props }, ref) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[190px] overflow-hidden rounded-xl border border-border-base bg-surface p-1 shadow-e3',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  )
})

export const DropdownItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { danger?: boolean }
>(function DropdownItem({ className, danger, ...props }, ref) {
  return (
    <DropdownPrimitive.Item
      ref={ref}
      className={cn(
        'flex h-8 cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-[13px] text-fg outline-none',
        'data-[highlighted]:bg-surface-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger && 'text-danger data-[highlighted]:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]',
        className,
      )}
      {...props}
    />
  )
})

export const DropdownCheckItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>
>(function DropdownCheckItem({ className, children, ...props }, ref) {
  return (
    <DropdownPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        'flex h-8 cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-[13px] text-fg outline-none',
        'data-[highlighted]:bg-surface-3',
        className,
      )}
      {...props}
    >
      <span className="grid h-4 w-4 place-items-center">
        <DropdownPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.CheckboxItem>
  )
})

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-border-base" />
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownPrimitive.Label className="px-2 py-1.5 text-[11px] font-[700] uppercase tracking-[0.08em] text-fg-subtle">
      {children}
    </DropdownPrimitive.Label>
  )
}
