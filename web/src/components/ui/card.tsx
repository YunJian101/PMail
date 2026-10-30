import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 全站统一的卡片语言。
 *
 * 圆角只用 4 档 token（见 index.css）：
 *   rounded-sm 12px —— 按钮 / 输入 / 下拉项
 *   rounded-md 14px —— 小卡 / 提示条
 *   rounded-lg 18px —— 弹层 / 对话框
 *   rounded-xl 22px —— 页面级卡片（就是这里）
 *
 * 页面里不要再手写 rounded-[Npx]。
 */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn('rounded-xl border border-border-base bg-surface shadow-e1', className)}
      {...props}
    >
      {children}
    </section>
  )
}

export function CardHeader({
  icon,
  title,
  desc,
  actions,
  className,
  children,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  desc?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn('flex items-start gap-2.5 px-4 pb-3 pt-3.5', className)}>
      {icon ? (
        <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-sm bg-surface-2 text-fg-subtle">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <b className="truncate text-[14px] font-[650] tracking-[-0.01em]">{title}</b>
          {children}
        </div>
        {desc ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">{desc}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-none items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 pb-4', className)} {...props}>
      {children}
    </div>
  )
}

/** 页面标题区：管理后台每个页面统一用它 */
export function PageHeader({
  title,
  desc,
  actions,
  className,
}: {
  title: React.ReactNode
  desc?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="m-0 text-[22px] font-[700] tracking-[-0.02em]">{title}</h1>
        {desc ? <p className="mt-0.5 text-[13px] text-fg-muted">{desc}</p> : null}
      </div>
      {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
    </div>
  )
}
