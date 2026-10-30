import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Network } from 'lucide-react'
import { post } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface PortState {
  service: string
  port: number
  ok: boolean
  error?: string
}

interface PortsInfo {
  webPort: number
  ports: PortState[]
}

/**
 * 邮件端口状态：端口被占用时应用不会退出，这里能看出哪个端口没起来。
 */
export function PortsCard() {
  const { t } = useTranslation()

  const portsQuery = useQuery({
    queryKey: ['mail-ports'],
    queryFn: () => post<PortsInfo>('/api/settings/mail_ports'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const info = portsQuery.data
  const failed = info?.ports.filter((item) => !item.ok) ?? []

  return (
    <Card>
      <CardHeader
        icon={<Network className="h-4 w-4" />}
        title={t('admin.settings.ports')}
        actions={
          failed.length > 0 ? (
            <Badge tone="warning">{t('admin.settings.portsFailed', { count: failed.length })}</Badge>
          ) : (
            <Badge tone="success">{t('admin.settings.portsOk')}</Badge>
          )
        }
      />
      <CardBody className="pt-1">
        {portsQuery.isLoading || !info ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="outline">
                {t('admin.settings.webPort')} · {info.webPort}
              </Badge>
              {info.ports.map((item) => (
                <Badge key={item.service} tone={item.ok ? 'success' : 'danger'}>
                  {item.service} · {item.port}
                </Badge>
              ))}
            </div>

            {failed.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {failed.map((item) => (
                  <p key={item.service} className="text-[12px] leading-relaxed text-danger">
                    {item.service} ({item.port})：{item.error}
                  </p>
                ))}
                <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                  {t('admin.settings.portsHint')}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
                {t('admin.settings.portsDesc')}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}
