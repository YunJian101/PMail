import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertOctagon,
  ChevronDown,
  FileText,
  Folder,
  Inbox,
  Languages,
  LogOut,
  Moon,
  PenLine,
  Send,
  Settings,
  Shield,
  Sun,
  Trash2,
  Users,
} from 'lucide-react'
import { fetchFolders } from '@/api/folders'
import type { FolderItem } from '@/api/types'
import { tagToSlug } from '@/lib/folders'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'
import { useCompose } from '@/store/compose'
import { useTheme } from '@/theme/theme-provider'
import { LANGUAGES, currentLanguage, setLanguage, type Language } from '@/i18n'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { VersionTag } from '@/components/ui/version-tag'
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown'

const FOLDER_ICONS: Record<string, React.ReactNode> = {
  inbox: <Inbox className="h-[17px] w-[17px]" strokeWidth={1.7} />,
  sent: <Send className="h-[17px] w-[17px]" strokeWidth={1.7} />,
  drafts: <FileText className="h-[17px] w-[17px]" strokeWidth={1.7} />,
  junk: <AlertOctagon className="h-[17px] w-[17px]" strokeWidth={1.7} />,
  trash: <Trash2 className="h-[17px] w-[17px]" strokeWidth={1.7} />,
}

function FolderLink({ item, depth = 0 }: { item: FolderItem; depth?: number }) {
  const slug = tagToSlug(item.tag)
  const icon = FOLDER_ICONS[slug] ?? <Folder className="h-[17px] w-[17px]" strokeWidth={1.7} />
  const children = item.children ?? []

  return (
    <>
      <NavLink
        to={`/mail/${slug}`}
        style={depth > 0 ? { paddingLeft: 10 + depth * 14 } : undefined}
        className={({ isActive }) =>
          cn(
            'group relative flex h-[36px] items-center gap-2.5 rounded-sm px-2.5 text-[13.5px] font-[500]',
            'text-fg-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg',
            isActive &&
              'bg-primary-soft font-[620] text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_16%,transparent)] hover:bg-primary-soft hover:text-primary',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span className={cn('flex-none', isActive ? 'text-primary' : 'text-fg-subtle')}>{icon}</span>
            <span className="truncate">{item.label}</span>
          </>
        )}
      </NavLink>
      {children.map((child) => (
        <FolderLink key={child.tag} item={child} depth={depth + 1} />
      ))}
    </>
  )
}

export function MailSidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const signOut = useSession((state) => state.signOut)
  const startCompose = useCompose((state) => state.start)
  const { resolved, toggle } = useTheme()

  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: fetchFolders,
    staleTime: 60_000,
  })

  const items = folders.data ?? []

  return (
    <aside className="flex h-full min-w-0 flex-col rounded-xl border border-border-base bg-surface px-2.5 pb-2.5 pt-3 shadow-e1">
      <div className="flex items-center gap-2.5 px-2 pb-3.5">
        <div className="grid h-9 w-9 place-items-center rounded-sm bg-gradient-to-br from-[#4f83ff] to-[#0ea5c6] shadow-[0_6px_16px_-8px_rgba(37,99,235,.9),inset_0_1px_0_rgba(255,255,255,.3)]">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="#fff" strokeWidth={1.9}>
            <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
            <path d="m3.5 7 7.4 5.3a2 2 0 0 0 2.2 0L20.5 7" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-[700] tracking-[-0.01em] leading-tight">PMail</div>
          <div className="truncate text-[11.5px] text-fg-subtle">
            {(user?.account ? user.account.split('@')[1] : '') || 'mail server'}
          </div>
        </div>
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-fg-subtle" />
      </div>

      <Button
        variant="primary"
        className="mb-3 h-[44px] w-full rounded-md text-[14px] shadow-[0_8px_20px_-10px_rgba(37,99,235,.9)]"
        onClick={() => startCompose('new')}
      >
        <PenLine className="h-4 w-4" />
        {t('compose.title')}
      </Button>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-none">
        {folders.isLoading ? (
          <div className="space-y-2 px-2 py-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full rounded-sm" />
            ))}
          </div>
        ) : (
          items.map((item) => <FolderLink key={item.tag} item={item} />)
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 pt-3">
        {user?.is_admin ? (
          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              cn(
                'flex h-[36px] items-center gap-2.5 rounded-sm px-2.5 text-[13.5px] font-[500] text-fg-muted',
                'transition-colors hover:bg-surface-3 hover:text-fg',
                isActive && 'bg-primary-soft text-primary',
              )
            }
          >
            <Users className="h-[17px] w-[17px] text-fg-subtle" strokeWidth={1.7} />
            {t('nav.admin')}
          </NavLink>
        ) : null}

        <NavLink
          to="/admin/security"
          className={({ isActive }) =>
            cn(
              'flex h-[36px] items-center gap-2.5 rounded-sm px-2.5 text-[13.5px] font-[500] text-fg-muted',
              'transition-colors hover:bg-surface-3 hover:text-fg',
              isActive && 'bg-primary-soft text-primary',
            )
          }
        >
          <Settings className="h-[17px] w-[17px] text-fg-subtle" strokeWidth={1.7} />
          {t('nav.settings')}
        </NavLink>

        <div className="mt-1.5 flex items-center gap-1 rounded-md border border-border-base bg-surface-2 p-1.5">
          <Dropdown>
            <DropdownTrigger asChild>
              <button className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm p-0.5 text-left">
                <Avatar name={user?.name} email={user?.account} size={30} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-[620]">{user?.name || user?.account}</span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">{user?.account}</span>
                </span>
              </button>
            </DropdownTrigger>
            <DropdownContent align="start" side="top" className="min-w-[220px]">
              <div className="px-2 py-1.5">
                <div className="text-[13px] font-[600]">{user?.name || user?.account}</div>
                <div className="text-[11.5px] text-fg-subtle">{user?.account}</div>
              </div>
              <DropdownSeparator />
              <DropdownItem onSelect={() => navigate('/admin/security')}>
                <Shield className="h-3.5 w-3.5" />
                {t('admin.security')}
              </DropdownItem>
              <DropdownItem onSelect={toggle}>
                {resolved === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                {t('common.theme')}
              </DropdownItem>
              <DropdownItem onSelect={() => setLanguage((currentLanguage() === 'zh' ? 'en' : 'zh') as Language)}>
                <Languages className="h-3.5 w-3.5" />
                {LANGUAGES.map((l) => l.label).join(' / ')}
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

          <Tooltip label={t('common.theme')}>
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t('common.theme')}>
              {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </Tooltip>
        </div>

        <div className="flex justify-center pt-2">
          <VersionTag />
        </div>
      </div>
    </aside>
  )
}
