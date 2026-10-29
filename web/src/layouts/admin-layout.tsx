import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Filter,
  Folder,
  Moon,
  Settings,
  Shield,
  Sun,
  Users,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'
import { useTheme } from '@/theme/theme-provider'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/ui/empty'
import { Tooltip } from '@/components/ui/tooltip'

const NAV_ITEMS = [
  { to: '/admin/users', label: 'admin.users', icon: Users },
  { to: '/admin/folders', label: 'admin.groups', icon: Folder },
  { to: '/admin/rules', label: 'admin.rules', icon: Filter },
  { to: '/admin/plugins', label: 'admin.plugins', icon: Zap },
  { to: '/admin/security', label: 'admin.security', icon: Shield },
  { to: '/admin/settings', label: 'admin.settings', icon: Settings },
] as const

export default function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const { resolved, toggle } = useTheme()

  return (
    <div className="grid h-full grid-cols-[236px_1fr] overflow-hidden bg-bg">
      <aside className="flex min-w-0 flex-col border-r border-border-base bg-surface-2 px-3 pb-3 pt-4">
        <div className="flex items-center gap-2.5 px-1.5 pb-4">
          <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-primary to-accent text-primary-fg shadow-e1">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9}>
              <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
              <path d="m3.5 7 7.4 5.3a2 2 0 0 0 2.2 0L20.5 7" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-[700] leading-tight tracking-[-0.01em]">
              {t('app.name')}
            </div>
            <div className="truncate text-[11.5px] text-fg-subtle">{t('admin.title')}</div>
          </div>
        </div>

        <Button
          variant="ghost"
          className="mb-2 h-9 w-full justify-start px-2.5"
          onClick={() => navigate('/mail/inbox')}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('admin.backToMail')}
        </Button>

        <nav className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto scrollbar-none">
          <div className="px-2.5 pb-1.5 pt-2">
            <SectionLabel>{t('admin.title')}</SectionLabel>
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-[34px] items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] font-[500]',
                    'text-fg-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg',
                    isActive &&
                      'bg-primary-soft font-[620] text-primary hover:bg-primary-soft hover:text-primary',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span className="absolute -left-3 top-[7px] bottom-[7px] w-[3px] rounded-r-[3px] bg-primary" />
                    ) : null}
                    <Icon
                      className={cn(
                        'h-[17px] w-[17px] flex-none',
                        isActive ? 'text-primary' : 'text-fg-subtle',
                      )}
                      strokeWidth={1.7}
                    />
                    <span className="truncate">{t(item.label)}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-3 flex items-center gap-1 border-t border-border-base pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
            <Avatar name={user?.name} email={user?.account} size={30} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-[620]">
                {user?.name || user?.account}
              </div>
              <div className="truncate text-[11.5px] text-fg-subtle">
                {user?.is_admin ? t('admin.users.roleAdmin') : t('admin.users.roleUser')}
              </div>
            </div>
          </div>
          <Tooltip label={t('common.theme')}>
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t('common.theme')}>
              {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </Tooltip>
        </div>
      </aside>

      <main className="min-w-0 overflow-y-auto px-8 py-6">
        <Outlet />
      </main>
    </div>
  )
}
