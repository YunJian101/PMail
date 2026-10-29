import { useTranslation } from 'react-i18next'
import { Globe, Info, User } from 'lucide-react'
import { useSession } from '@/store/session'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

export function SettingsPage() {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)
  const domains = user?.domains ?? []

  return (
    <div>
      <div className="flex items-end gap-3.5">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-[700] tracking-[-0.02em]">{t('admin.settings')}</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">{t('admin.settings.desc')}</p>
        </div>
      </div>

      {/* 后端没有读取系统配置的接口（/api/settings/* 只有 modify_password），这里只做只读展示 */}
      <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border-base bg-surface shadow-e1">
          <div className="flex items-center gap-2 border-b border-border-base px-4 py-3">
            <User className="h-4 w-4 text-fg-subtle" />
            <b className="text-[14px] font-[650]">{t('admin.security.session')}</b>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center gap-2.5">
              <Avatar name={user?.name} email={user?.account} size={34} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-[600]">{user?.name || user?.account}</div>
                <div className="truncate font-mono text-[11.5px] text-fg-subtle">{user?.account}</div>
              </div>
              <div className="ml-auto">
                {user?.is_admin ? (
                  <Badge tone="primary">{t('admin.users.roleAdmin')}</Badge>
                ) : (
                  <Badge>{t('admin.users.roleUser')}</Badge>
                )}
              </div>
            </div>

            <dl className="mt-3 space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-subtle">{t('admin.users.colAccount')}</dt>
                <dd className="truncate font-mono text-fg">{user?.account || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-subtle">{t('admin.users.form.name')}</dt>
                <dd className="truncate text-fg">{user?.name || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-subtle">{t('admin.users.colRole')}</dt>
                <dd className="text-fg">
                  {user?.is_admin ? t('admin.users.roleAdmin') : t('admin.users.roleUser')}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="rounded-xl border border-border-base bg-surface shadow-e1">
          <div className="flex items-center gap-2 border-b border-border-base px-4 py-3">
            <Globe className="h-4 w-4 text-fg-subtle" />
            <b className="text-[14px] font-[650]">{t('admin.settings.domain')}</b>
            <span className="text-[12px] tabular-nums text-fg-subtle">{domains.length}</span>
          </div>
          <div className="px-4 py-4">
            {domains.length === 0 ? (
              <p className="text-[12.5px] text-fg-subtle">{t('common.empty')}</p>
            ) : (
              <ul className="divide-y divide-border-base">
                {domains.map((domain, index) => (
                  <li key={domain} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                    <Globe className="h-3.5 w-3.5 flex-none text-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg">
                      {domain}
                    </span>
                    {index === 0 ? (
                      <Badge tone="primary">{t('admin.settings.domain')}</Badge>
                    ) : (
                      <Badge tone="outline">{t('admin.settings.multiDomain')}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border-base bg-surface-2 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-none text-fg-subtle" />
        <div className="min-w-0">
          <p className="text-[12.5px] leading-relaxed text-fg-muted">
            {t('admin.settings.desc')} {t('admin.settings.restartHint')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{t('admin.settings.domain')}</Badge>
            <Badge tone="outline">{t('admin.settings.ssl')}</Badge>
            <Badge tone="outline">{t('setup.db.title')}</Badge>
            <code className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-muted">
              config.json
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
