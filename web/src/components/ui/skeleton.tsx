import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-surface-3', className)}
      {...props}
    />
  )
}

/** 邮件列表骨架屏：形状和真实行保持一致，避免切换时跳动 */
export function MailListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[color-mix(in_srgb,var(--border)_65%,transparent)]">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex gap-2.5 px-4 py-[13px]">
          <Skeleton className="h-[34px] w-[34px] rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-[70%]" />
            <Skeleton className="h-3 w-[88%]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-fg-subtle', className)} />
}

export function PageLoading({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-fg-subtle">
      <Spinner className="h-5 w-5" />
      <span className="text-[12.5px]">{label}</span>
    </div>
  )
}
