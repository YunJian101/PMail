import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Puzzle, RefreshCw, Settings2 } from 'lucide-react'
import { fetchPlugins, pluginSettingsUrl } from '@/api/users'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'

export function PluginsPage() {
  const { t } = useTranslation()
  const [active, setActive] = React.useState<string | null>(null)

  // 插件不存在时后端会吐空 body（plugin.go 漏了 FPrint），这里直接当「没有插件」处理
  const pluginsQuery = useQuery({
    queryKey: ['admin-plugins'],
    queryFn: fetchPlugins,
    retry: false,
  })

  const plugins = pluginsQuery.data ?? []
  const isEmpty = pluginsQuery.isError || (!pluginsQuery.isLoading && plugins.length === 0)

  return (
    <div>
      <div className="flex items-end gap-3.5">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-[700] tracking-[-0.02em]">{t('admin.plugins')}</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">{t('admin.plugins.desc')}</p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          <Tooltip label={t('common.refresh')}>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => void pluginsQuery.refetch()}
              disabled={pluginsQuery.isFetching}
              aria-label={t('common.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', pluginsQuery.isFetching && 'animate-spin')} />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="mt-5">
        {pluginsQuery.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-[132px] w-full rounded-xl" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="rounded-xl border border-border-base bg-surface shadow-e1">
            <EmptyState
              icon={<Puzzle className="h-5 w-5" />}
              title={t('admin.plugins.empty')}
              description={t('admin.plugins.desc')}
            />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {plugins.map((name) => (
              <div
                key={name}
                className="rounded-xl border border-border-base bg-surface p-4 shadow-e1"
              >
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-primary-soft text-primary">
                    <Puzzle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-[620] text-fg">{name}</div>
                    <div className="text-[11.5px] text-fg-subtle">
                      {t('admin.plugins.installed')}
                    </div>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setActive(name)}
                >
                  <Settings2 className="h-4 w-4" />
                  {t('admin.plugins.openSettings')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setActive(null)
        }}
      >
        <DialogContent width="max-w-3xl">
          <DialogHeader title={active ?? ''} description={t('admin.plugins.desc')} />
          <div className="p-4">
            <iframe
              title={active ?? 'plugin'}
              src={active ? pluginSettingsUrl(active) : 'about:blank'}
              className="h-[480px] w-full rounded-xl border border-border-base bg-surface"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
