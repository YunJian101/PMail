import { useQuery } from '@tanstack/react-query'
import { fetchVersion } from '@/api/version'
import { cn } from '@/lib/utils'

/**
 * 版本号标签：登录页、侧边栏、设置页共用。
 * 版本号来自构建时注入（manifest 的 version），后端 /api/version 直接吐出来。
 */
export function VersionTag({
  className,
  withBuild = false,
}: {
  className?: string
  withBuild?: boolean
}) {
  const { data } = useQuery({
    queryKey: ['app-version'],
    queryFn: fetchVersion,
    staleTime: Infinity,
    retry: 1,
  })

  if (!data?.version) return null

  return (
    <span className={cn('text-[11.5px] tabular-nums text-fg-subtle', className)}>
      v{data.version}
      {withBuild && data.buildTime ? ` · ${data.buildTime.replace('T', ' ').replace('Z', '')}` : ''}
    </span>
  )
}
