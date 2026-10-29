import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'relative h-[19px] w-[34px] flex-none cursor-pointer rounded-full bg-border-strong transition-colors',
        'data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block h-[15px] w-[15px] translate-x-[2px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)]',
          'transition-transform duration-150 data-[state=checked]:translate-x-[17px]',
        )}
      />
    </SwitchPrimitive.Root>
  )
})
