import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { post } from '@/api/client'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface SystemInfo {
  version: string
  buildTime: string
  gitHash: string
  goVersion: string
  domain: string
  webDomain: string
  domains: string[]
  webPort: number
  dbType: string
  dataDir: string
  sslSource: string
}

/** 系统信息：正在使用的端口与配置，一屏看全 */
export function SystemInfoCard() {
  const { t } = useTranslation()

  const infoQuery = useQuery({
    queryKey: ['system-info'],
    queryFn: () => post<SystemInfo>('/api/settings/system_info'),
    staleTime: 60_000,
  })

  const info = infoQuery.data

  const rows: { label: string; value: string }[] = info
    ? [
        { label: t('admin.settings.version'), value: `v${info.version}` },
        {
          label: t('admin.settings.buildTime'),
          value: info.buildTime ? info.buildTime.replace('T', ' ').replace('Z', '') : '—',
        },
        { label: t('admin.settings.mailDomain'), value: info.domain || '—' },
        { label: t('admin.settings.webDomainLabel'), value: info.webDomain || '—' },
        // 只显示实际在用的网页端口；HTTPS 没启用就不出现，避免把没开的功能摆出来
        { label: t('admin.settings.webPort'), value: `${info.webPort}` },
        { label: t('admin.settings.dbType'), value: info.dbType || '—' },
        { label: t('admin.settings.dataDir'), value: info.dataDir || '—' },
      ]
    : []

  return (
    <Card>
      <CardHeader icon={<Info className="h-4 w-4" />} title={t('admin.settings.systemInfo')} />
      <CardBody className="pt-1">
        {infoQuery.isLoading || !info ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <dl className="space-y-2 text-[12.5px]">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-3">
                <dt className="flex-none text-fg-subtle">{row.label}</dt>
                <dd className="min-w-0 break-all text-right font-mono text-fg">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardBody>
    </Card>
  )
}
