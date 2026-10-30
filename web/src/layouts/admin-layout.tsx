import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ChevronDown,
  Filter,
  Folder,
  Inbox,
  LogOut,
  Moon,
  Settings,
  Sun,
  Users,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'
import { useTheme } from '@/theme/theme-provider'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown'

const NAV_ITEMS = [
  { to: '/admin/users', label: 'admin.users', icon: Users },
  { to: '/admin/folders', label: 'admin.groups', icon: Folder },
  { to: '/admin/rules', label: 'admin.rules', icon: Filter },
  { to: '/admin/plugins', label: 'admin.plugins', icon: Zap },
  { to: '/admin/settings', label: 'admin.settings', icon: Settings },
] as const

/**
 * 管理后台外壳：和邮件页同一套语言——浮动圆角侧栏卡片 + 右侧内容区。
 * 窄屏没有侧边栏，顶部补一条「返回邮箱 + 页面切换 + 账号菜单」。
 */
export default function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSession((state) => state.user)
  const signOut = useSession((state) => state.signOut)
  const { resolved, toggle } = useTheme()

  const currentItem = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to)) ?? NAV_ITEMS[0]

  const accountMenu = (
    <DropdownContent align="end" className="min-w-[210px]">
      <div className="px-2 py-1.5">
        <div className="truncate text-[13px] font-[600]">{user?.name || user?.account}</div>
        <div className="truncate text-[11.5px] text-fg-subtle">{user?.account}</div>
      </div>
      <DropdownSeparator />
      <DropdownItem onSelect={() => navigate('/mail/inbox')}>
        <Inbox className="h-3.5 w-3.5" />
        {t('nav.mailbox')}
      </DropdownItem>
      <DropdownItem onSelect={() => navigate('/mail/settings')}>
        <Settings className="h-3.5 w-3.5" />
        {t('account.title')}
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem
        danger
        onSelect={async () => {
          await signOut()
          navigate('/login', { replace: true })
        }}
      >
        <LogOut className="h-3.5 w-3.5" />
        {t('common.logout')}
      </DropdownItem>
    </DropdownContent>
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg lg:flex-row lg:gap-2.5 lg:p-3">
      <aside className="hidden h-full min-h-0 w-[236px] flex-none flex-col rounded-xl border border-border-base bg-surface px-2.5 pb-2.5 pt-3 shadow-e1 lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-3">
          <div className="grid h-9 w-9 place-items-center rounded-sm bg-gradient-to-br from-primary to-accent text-primary-fg shadow-[0_6px_16px_-8px_rgba(37,99,235,.9)]">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9}>
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
          className="mb-2 h-9 w-full justify-start rounded-sm px-2.5"
          onClick={() => navigate('/mail/inbox')}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('admin.backToMail')}
        </Button>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-none">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex h-[36px] items-center gap-2.5 rounded-sm px-2.5 text-[13.5px] font-[500]',
                    'text-fg-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg',
                    isActive &&
                      'bg-primary-soft font-[620] text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_16%,transparent)] hover:bg-primary-soft hover:text-primary',
                  )
                }
              >
                {({ isActive }) => (
                  <>
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

        <div className="mt-2 flex items-center gap-1 rounded-md border border-border-base bg-surface-2 p-1.5">
          <Dropdown>
            <DropdownTrigger asChild>
              <button className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm p-0.5 text-left transition-colors hover:bg-surface-3">
                <Avatar name={user?.name} email={user?.account} size={30} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-[620]">{user?.name || user?.account}</span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">{user?.account}</span>
                </span>
              </button>
            </DropdownTrigger>
            {accountMenu}
          </Dropdown>
          <Tooltip label={t('common.theme')}>
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t('common.theme')}>
              {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </Tooltip>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* 窄屏顶栏：返回邮箱 + 页面切换 + 账号菜单 */}
        <div className="flex h-12 flex-none items-center gap-1 border-b border-border-base bg-surface px-2 lg:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate('/mail/inbox')}
            aria-label={t('admin.backToMail')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <Dropdown>
            <DropdownTrigger asChild>
              <button className="flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-1 text-[13.5px] font-[600] hover:bg-surface-3">
                <span className="truncate">{t(currentItem.label)}</span>
                <ChevronDown className="h-3.5 w-3.5 flex-none text-fg-subtle" />
              </button>
            </DropdownTrigger>
            <DropdownContent align="start">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownItem key={item.to} onSelect={() => navigate(item.to)}>
                    <Icon className="h-3.5 w-3.5 text-fg-subtle" />
                    {t(item.label)}
                  </DropdownItem>
                )
              })}
            </DropdownContent>
          </Dropdown>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t('common.theme')}>
              {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Dropdown>
              <DropdownTrigger asChild>
                <button
                  className="flex flex-none items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-surface-3"
                  aria-label={t('account.title')}
                >
                  <Avatar name={user?.name} email={user?.account} size={28} />
                  <ChevronDown className="h-3 w-3 text-fg-subtle" />
                </button>
              </DropdownTrigger>
              {accountMenu}
            </Dropdown>
          </div>
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto rounded-none bg-surface px-4 py-4 lg:rounded-xl lg:border lg:border-border-base lg:px-7 lg:py-6 lg:shadow-e1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
