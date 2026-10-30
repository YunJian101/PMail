import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Folder, LogOut, PenLine, Settings, Shield } from 'lucide-react'
import { MailSidebar } from '@/components/mail/sidebar'
import { Composer } from '@/components/mail/composer'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown'
import { fetchFolders } from '@/api/folders'
import { tagToSlug } from '@/lib/folders'
import { useCompose } from '@/store/compose'
import { useSession } from '@/store/session'

export default function MailLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { folder = 'inbox' } = useParams<{ folder: string }>()
  const startCompose = useCompose((state) => state.start)
  const user = useSession((state) => state.user)
  const signOut = useSession((state) => state.signOut)
  const folders = useQuery({ queryKey: ['folders'], queryFn: fetchFolders, staleTime: 60_000 })

  const current = (folders.data ?? []).find((item) => tagToSlug(item.tag) === folder)

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-bg lg:gap-2.5 lg:p-3">
      {/* 桌面端侧边栏；窄屏收起，用顶栏代替 */}
      <div className="hidden h-full min-h-0 flex-none lg:block lg:w-[244px]">
        <MailSidebar />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 flex-none items-center gap-2 border-b border-border-base bg-surface px-3 lg:hidden">
          <div className="grid h-7 w-7 flex-none place-items-center rounded-sm bg-gradient-to-br from-[#4f83ff] to-[#0ea5c6]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#fff" strokeWidth={2}>
              <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
              <path d="m3.5 7 7.4 5.3a2 2 0 0 0 2.2 0L20.5 7" strokeLinecap="round" />
            </svg>
          </div>

          {/* 窄屏没有侧边栏，这里补一个文件夹切换 */}
          <Dropdown>
            <DropdownTrigger asChild>
              <button className="flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-1 text-[13.5px] font-[600] hover:bg-surface-3">
                <span className="truncate">{current?.label ?? t('folder.inbox')}</span>
                <ChevronDown className="h-3.5 w-3.5 flex-none text-fg-subtle" />
              </button>
            </DropdownTrigger>
            <DropdownContent align="start" className="max-h-[60vh] overflow-y-auto">
              {(folders.data ?? []).map((item) => (
                <DropdownItem key={item.tag} onSelect={() => navigate(`/mail/${tagToSlug(item.tag)}`)}>
                  <Folder className="h-3.5 w-3.5 text-fg-subtle" />
                  {item.label}
                </DropdownItem>
              ))}
            </DropdownContent>
          </Dropdown>

          <Button
            variant="primary"
            size="sm"
            className="ml-auto rounded-full"
            onClick={() => startCompose('new')}
          >
            <PenLine className="h-3.5 w-3.5" />
            {t('compose.title')}
          </Button>

          {/* 窄屏没有侧边栏，账号菜单放这里，否则手机上退不出去 */}
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
            <DropdownContent align="end" className="min-w-[210px]">
              <div className="px-2 py-1.5">
                <div className="truncate text-[13px] font-[600]">{user?.name || user?.account}</div>
                <div className="truncate text-[11.5px] text-fg-subtle">{user?.account}</div>
              </div>
              <DropdownSeparator />
              {/* 管理员才有「管理服务器」；窄屏侧边栏是隐藏的，入口折叠到这里 */}
              {user?.is_admin ? (
                <>
                  <DropdownItem onSelect={() => navigate('/admin/users')}>
                    <Shield className="h-3.5 w-3.5" />
                    {t('nav.admin')}
                  </DropdownItem>
                  <DropdownSeparator />
                </>
              ) : null}
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
          </Dropdown>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>

      <Composer />
    </div>
  )
}
