import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Folder, PenLine } from 'lucide-react'
import { MailSidebar } from '@/components/mail/sidebar'
import { Composer } from '@/components/mail/composer'
import { Button } from '@/components/ui/button'
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from '@/components/ui/dropdown'
import { fetchFolders } from '@/api/folders'
import { tagToSlug } from '@/lib/folders'
import { useCompose } from '@/store/compose'

export default function MailLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { folder = 'inbox' } = useParams<{ folder: string }>()
  const startCompose = useCompose((state) => state.start)
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
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>

      <Composer />
    </div>
  )
}
