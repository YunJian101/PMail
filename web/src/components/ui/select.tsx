import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 自绘下拉框（替代原生 <select>）。
 *
 * 兼容原来的用法：children 传 <option value="x">文案</option> 即可，
 * 所以调用方一行都不用改。
 */
export interface SelectOption {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

function readOptions(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean }
    if (props.value === undefined) return
    options.push({
      value: String(props.value),
      label: props.children,
      disabled: props.disabled,
    })
  })
  return options
}

export interface SelectProps {
  value?: string
  onChange?: (event: { target: { value: string } }) => void
  children?: React.ReactNode
  className?: string
  disabled?: boolean
  placeholder?: string
  id?: string
  name?: string
  /** default = 表单里的圆角输入框样式；plain = 无边框，塞进紧凑行里用 */
  variant?: 'default' | 'plain'
}

export function Select({
  value,
  onChange,
  children,
  className,
  disabled,
  placeholder = '请选择',
  id,
  name,
  variant = 'default',
}: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const options = React.useMemo(() => readOptions(children), [children])
  const current = options.find((option) => option.value === value)

  const choose = (next: string) => {
    onChange?.({ target: { value: next } })
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          name={name}
          className={cn(
            'flex w-full items-center justify-between gap-2 text-left text-[13.5px] text-fg',
            'transition-[border-color,box-shadow,color] duration-150',
            'disabled:cursor-not-allowed disabled:opacity-60',
            variant === 'plain'
              ? 'h-7 rounded-md border-0 bg-transparent px-0 hover:text-primary focus:outline-none'
              : 'h-10 rounded-sm border border-border-base bg-surface px-3 hover:border-border-strong focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)]',
            variant !== 'plain' && open && 'border-primary ring-[3px] ring-[var(--ring)]',
            className,
          )}
        >
          <span className={cn('truncate', !current && 'text-fg-subtle')}>
            {current ? current.label : placeholder}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 flex-none text-fg-subtle transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-[280px] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-lg border border-border-base bg-surface p-1 shadow-e3"
        >
          {options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => choose(option.value)}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[13px] text-fg',
                  'transition-colors hover:bg-surface-3 disabled:pointer-events-none disabled:opacity-50',
                  active && 'font-[600] text-primary',
                )}
              >
                <span className="grid h-4 w-4 flex-none place-items-center">
                  {active ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} /> : null}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            )
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
