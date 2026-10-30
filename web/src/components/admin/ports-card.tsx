import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Network } from 'lucide-react'
import { post } from '@/api/client'
import { toast, errorText } from '@/lib/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
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

/** 服务名 → ports.env 键名 */
const SERVICE_TO_KEY: Record<string, string> = {
  SMTP: 'PMAIL_PORT_SMTP',
  'SMTP-SSL': 'PMAIL_PORT_SMTPS',
  'SMTP-SUBMISSION': 'PMAIL_PORT_SUBMISSION',
  IMAP: 'PMAIL_PORT_IMAP',
  POP3: 'PMAIL_PORT_POP3',
  POP3S: 'PMAIL_PORT_POP3S',
}

/**
 * 邮件端口：显示各端口监听状态，并允许直接改（写 ports.env 后重启生效）。
 */
export function PortsCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const portsQuery = useQuery({
    queryKey: ['mail-ports'],
    queryFn: () => post<PortsInfo>('/api/settings/mail_ports'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const info = portsQuery.data
  const failed = info?.ports.filter((item) => !item.ok) ?? []

  const [draft, setDraft] = React.useState<Record<string, string>>({})
  const [touched, setTouched] = React.useState(false)

  // 首次拿到数据时填充表单
  React.useEffect(() => {
    if (!info || touched) return
    const next: Record<string, string> = { PMAIL_PORT_WEB: String(info.webPort) }
    for (const item of info.ports) {
      const key = SERVICE_TO_KEY[item.service]
      if (key) next[key] = String(item.port)
    }
    setDraft(next)
  }, [info, touched])

  const saveMutation = useMutation({
    mutationFn: () => post<{ restart: boolean }>('/api/settings/mail_ports/update', { ports: draft }),
    onSuccess: () => {
      toast.success(t('admin.settings.portsSaved'))
      setTouched(false)
      void queryClient.invalidateQueries({ queryKey: ['mail-ports'] })
    },
    onError: (error) => toast.error(errorText(error)),
  })

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

            <div className="mt-4 grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('admin.settings.webPort')}>
                <Input
                  value={draft.PMAIL_PORT_WEB ?? ''}
                  inputMode="numeric"
                  onChange={(event) => {
                    setTouched(true)
                    setDraft((prev) => ({
                      ...prev,
                      PMAIL_PORT_WEB: event.target.value.replace(/[^0-9]/g, ''),
                    }))
                  }}
                />
              </Field>
              {info.ports.map((item) => {
                const key = SERVICE_TO_KEY[item.service]
                if (!key) return null
                return (
                  <Field key={key} label={item.service}>
                    <Input
                      value={draft[key] ?? ''}
                      inputMode="numeric"
                      onChange={(event) => {
                        setTouched(true)
                        setDraft((prev) => ({ ...prev, [key]: event.target.value.replace(/[^0-9]/g, '') }))
                      }}
                    />
                  </Field>
                )
              })}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <Button
                variant="primary"
                disabled={!touched || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? t('common.loading') : t('admin.settings.portsSave')}
              </Button>
              <span className="text-[11.5px] text-fg-subtle">{t('admin.settings.portsRestart')}</span>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}
