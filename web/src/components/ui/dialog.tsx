import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  width = 'max-w-lg',
  hideClose = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  width?: string
  hideClose?: boolean
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-40 bg-[rgba(9,14,26,.45)] backdrop-blur-[3px]',
          'data-[state=open]:opacity-100',
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-40px)] -translate-x-1/2 -translate-y-1/2',
          'overflow-hidden rounded-xl border border-border-base bg-surface shadow-e3',
          'focus:outline-none',
          width,
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-sm text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({
  title,
  description,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('border-b border-border-base/70 px-5 py-4 pr-12', className)}>
      <DialogPrimitive.Title className="text-[15px] font-[650] tracking-[-0.01em] text-fg">
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="mt-1 text-[12.5px] text-fg-muted">
          {description}
        </DialogPrimitive.Description>
      ) : null}
    </div>
  )
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-border-base bg-surface-2 px-5 py-3',
        className,
      )}
      {...props}
    />
  )
}
