import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  Inbox,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import {
  deleteMail,
  fetchUnreadCounts,
  getMailDetail,
  listMail,
  markMailRead,
  moveMail,
} from '@/api/mail'
import { fetchFolders } from '@/api/folders'
import type { FolderItem, MailListItem } from '@/api/types'
import { slugToMoveTarget, slugToTag, tagToSlug } from '@/lib/folders'
import { formatListTime, truncate } from '@/lib/format'
import { cn, avatarTone } from '@/lib/utils'
import { toast, errorText } from '@/lib/toast'
import { useCompose } from '@/store/compose'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { EmptyState, Kbd } from '@/components/ui/empty'
import { MailListSkeleton } from '@/components/ui/skeleton'
import { MailReader } from '@/components/mail/reader'
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown'

const PAGE_SIZE = 20

function flattenFolders(items: FolderItem[]): FolderItem[] {
  const out: FolderItem[] = []
  const walk = (list: FolderItem[]) => {
    list.forEach((item) => {
      out.push(item)
      if (item.children?.length) walk(item.children)
    })
  }
  walk(items)
  return out
}

function MailRow({
  item,
  active,
  selected,
  onOpen,
  onToggleSelect,
}: {
  item: MailListItem
  active: boolean
  selected: boolean
  onOpen: () => void
  onToggleSelect: (event: React.MouseEvent) => void
}) {
  const { t } = useTranslation()
  const sender = item.sender?.Name || item.sender?.EmailAddress || ''
  const email = item.sender?.EmailAddress || ''
  const unread = !item.is_read

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group relative mx-1.5 my-1 grid cursor-pointer grid-cols-[34px_1fr_auto] gap-2.5 rounded-md px-3 py-2.5',
        'transition-colors duration-150',
        unread
          ? 'bg-[color-mix(in_srgb,var(--primary-soft)_55%,var(--surface))] hover:bg-primary-soft'
          : 'hover:bg-surface-2',
        active && 'bg-primary-soft hover:bg-primary-soft',
        selected && 'bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))]',
      )}
    >
      {active ? (
        <span className="pointer-events-none absolute inset-0 rounded-md ring-[1.5px] ring-[color-mix(in_srgb,var(--primary)_35%,transparent)]" />
      ) : null}
      {unread ? (
        <span className="pointer-events-none absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" />
      ) : null}

      <div className="relative mt-px">
        <Avatar
          name={sender}
          email={email}
          size={34}
          tone={avatarTone(email || sender)}
          className="transition-opacity group-hover:opacity-0"
        />
        <button
          type="button"
          aria-label={t('mail.select.all')}
          onClick={onToggleSelect}
          className={cn(
            'absolute inset-0 grid h-[34px] w-[34px] place-items-center rounded-full border-2 border-border-strong bg-surface text-transparent',
            'opacity-0 transition-opacity group-hover:opacity-100',
            selected && 'border-primary bg-primary text-white opacity-100',
          )}
        >
          {selected ? <span className="text-[12px] font-bold">✓</span> : null}
        </button>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('truncate text-[13.5px]', unread ? 'font-[700]' : 'font-[550]')}>
            {sender || email}
          </span>
          {item.dangerous ? (
            <AlertTriangle className="h-3 w-3 flex-none text-warning" />
          ) : null}
          {item.error ? <Badge tone="danger">{t('mail.deliveryFailed')}</Badge> : null}
        </div>
        <div className={cn('mt-px truncate text-[13px]', unread ? 'font-[650]' : 'font-[500]')}>
          {item.title || t('mail.noSubject')}
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-fg-subtle">{truncate(item.desc, 90)}</div>
      </div>

      <div className="flex flex-col items-end gap-1.5 pt-px">
        <span
          className={cn(
            'whitespace-nowrap text-[11.5px] tabular-nums',
            unread ? 'font-[600] text-primary' : 'text-fg-subtle',
          )}
        >
          {formatListTime(item.datetime)}
        </span>
        <div className="flex items-center gap-1.5 text-fg-subtle">
          {unread ? <i className="h-[6px] w-[6px] rounded-full bg-primary" /> : null}
          {item.desc ? <Paperclip className="h-3 w-3 opacity-0" /> : null}
        </div>
      </div>
    </div>
  )
}

export function InboxPage() {
  const { t } = useTranslation()
  const { folder = 'inbox' } = useParams<{ folder: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const startCompose = useCompose((state) => state.start)

  const selectedId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const [page, setPage] = React.useState(1)
  const [keywordInput, setKeywordInput] = React.useState('')
  const [keyword, setKeyword] = React.useState('')
  const [selection, setSelection] = React.useState<number[]>([])
  const searchRef = React.useRef<HTMLInputElement | null>(null)

  // Ctrl/Cmd + K 聚焦搜索框
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 切文件夹时重置分页、选中与搜索
  React.useEffect(() => {
    setPage(1)
    setSelection([])
  }, [folder])

  React.useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(keywordInput.trim()), 320)
    return () => window.clearTimeout(timer)
  }, [keywordInput])

  React.useEffect(() => {
    setPage(1)
  }, [keyword])

  const tag = React.useMemo(() => slugToTag(folder), [folder])

  const foldersQuery = useQuery({ queryKey: ['folders'], queryFn: fetchFolders, staleTime: 60_000 })
  const folderItems = React.useMemo(
    () => flattenFolders(foldersQuery.data ?? []),
    [foldersQuery.data],
  )
  const currentFolder = folderItems.find((item) => tagToSlug(item.tag) === folder)

  const listQuery = useQuery({
    queryKey: ['mail-list', folder, page, keyword],
    queryFn: () => listMail({ tag, keyword, current_page: page, page_size: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })

  const detailQuery = useQuery({
    queryKey: ['mail-detail', selectedId],
    queryFn: () => getMailDetail(selectedId as number),
    enabled: Boolean(selectedId),
  })

  // 打开详情会被后端标记为已读，这里把列表的未读状态同步掉
  React.useEffect(() => {
    if (detailQuery.data && selectedId) {
      queryClient.invalidateQueries({ queryKey: ['mail-list'] })
    }
  }, [detailQuery.data, selectedId, queryClient])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['mail-list'] })
  }

  const readMutation = useMutation({
    mutationFn: (ids: number[]) => markMailRead(ids),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorText(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteMail(ids, folder === 'trash'),
    onSuccess: () => {
      setSelection([])
      setSearchParams({}, { replace: true })
      invalidate()
      toast.success(t('common.deleted'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const moveMutation = useMutation({
    mutationFn: ({ ids, groupId }: { ids: number[]; groupId: number }) => moveMail(ids, groupId),
    onSuccess: () => {
      setSelection([])
      invalidate()
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const mails = listQuery.data?.list ?? []
  const totalPage = Math.max(1, listQuery.data?.total_page ?? 1)
  const currentPage = listQuery.data?.current_page || page

  const openMail = (id: number) => {
    setSearchParams({ id: String(id) }, { replace: true })
  }

  const toggleSelect = (id: number) => {
    setSelection((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const moveTargets = folderItems.filter((item) => tagToSlug(item.tag) !== folder)

  // 阅读区「移动到」下拉：把 tag 换算成后端要的 group_id
  const readerMoveTargets = React.useMemo(
    () =>
      moveTargets
        .map((item) => ({ label: item.label, groupId: slugToMoveTarget(tagToSlug(item.tag)) }))
        .filter((item): item is { label: string; groupId: number } => item.groupId !== null),
    [moveTargets],
  )

  // 未读数（和侧边栏共用同一个 queryKey，15 秒刷新一次）
  const unreadQuery = useQuery({
    queryKey: ['unread'],
    queryFn: fetchUnreadCounts,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  })
  const folderUnread = unreadQuery.data?.[folder] ?? 0

  return (
    <div className="grid h-full min-w-0 grid-cols-1 gap-2.5 overflow-hidden md:grid-cols-[340px_1fr] xl:grid-cols-[396px_1fr]">
      {/* ---------------- 列表 ---------------- */}
      <section
        className={cn(
          'min-w-0 flex-col overflow-hidden bg-surface md:rounded-xl md:border md:border-border-base md:shadow-e1',
          selectedId ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className="px-4 pb-3 pt-4">
          <div className="mb-3 flex items-baseline gap-2">
            <h1 className="m-0 text-[17px] font-[700] tracking-[-0.015em]">
              {currentFolder?.label || t('folder.inbox')}
            </h1>
            <span className="text-[12px] tabular-nums text-fg-subtle">
              {listQuery.data ? t('mail.list.count', { count: mails.length }) : ''}
            </span>
            {folderUnread > 0 ? (
              <Badge tone="primary">{t('mail.unreadCount', { count: folderUnread })}</Badge>
            ) : null}
            <div className="ml-auto flex items-center gap-0.5">
              <Tooltip label={t('common.refresh')}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => listQuery.refetch()}
                  disabled={listQuery.isFetching}
                >
                  <RefreshCw className={cn('h-4 w-4', listQuery.isFetching && 'animate-spin')} />
                </Button>
              </Tooltip>
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('common.more')}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownItem
                    onSelect={() => readMutation.mutate(mails.filter((m) => !m.is_read).map((m) => m.id))}
                  >
                    <MailOpen className="h-3.5 w-3.5" />
                    {t('mail.action.markRead')}
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => setSelection(mails.map((m) => m.id))}>
                    <Inbox className="h-3.5 w-3.5" />
                    {t('mail.select.all')}
                  </DropdownItem>
                </DropdownContent>
              </Dropdown>
            </div>
          </div>

          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-[15px] w-[15px] text-fg-subtle" />
            <Input
              ref={searchRef}
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder={t('mail.search.placeholder')}
              className="h-9 rounded-full border-transparent bg-surface-2 pl-9 pr-9 text-[13px] focus:border-primary focus:bg-surface"
            />
            {keywordInput ? (
              <button
                type="button"
                onClick={() => setKeywordInput('')}
                className="absolute right-2.5 grid h-5 w-5 place-items-center rounded text-fg-subtle hover:bg-surface-3"
                aria-label={t('common.close')}
              >
                <X className="h-3 w-3" />
              </button>
            ) : (
              <span className="absolute right-2.5">
                <Kbd>Ctrl K</Kbd>
              </span>
            )}
          </div>
        </div>

        {selection.length > 0 ? (
          <div className="mx-2 mb-1.5 flex items-center gap-1.5 rounded-sm bg-primary-soft px-3 py-1.5">
            <span className="text-[12.5px] font-[600] text-primary">
              {t('mail.select.count', { count: selection.length })}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Tooltip label={t('mail.action.markRead')}>
                <Button variant="ghost" size="icon-sm" onClick={() => readMutation.mutate(selection)}>
                  <MailOpen className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('mail.action.move')}>
                    <FolderInput className="h-4 w-4" />
                  </Button>
                </DropdownTrigger>
                <DropdownContent align="end">
                  {moveTargets.map((target) => {
                    const groupId = slugToMoveTarget(tagToSlug(target.tag))
                    return (
                      <DropdownItem
                        key={target.tag}
                        onSelect={() => {
                          if (groupId !== null) moveMutation.mutate({ ids: selection, groupId })
                        }}
                      >
                        {target.label}
                      </DropdownItem>
                    )
                  })}
                </DropdownContent>
              </Dropdown>
              <Tooltip label={t('mail.action.delete')}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-danger hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                  onClick={() => deleteMutation.mutate(selection)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Button variant="ghost" size="icon-sm" onClick={() => setSelection([])}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {listQuery.isLoading ? (
            <MailListSkeleton rows={7} />
          ) : mails.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title={keyword ? t('common.empty') : t('folder.empty')}
              description={keyword ? t('mail.search.placeholder') : undefined}
            />
          ) : (
            mails.map((item) => (
              <MailRow
                key={item.id}
                item={item}
                active={item.id === selectedId}
                selected={selection.includes(item.id)}
                onOpen={() => openMail(item.id)}
                onToggleSelect={(event) => {
                  event.stopPropagation()
                  toggleSelect(item.id)
                }}
              />
            ))
          )}
        </div>

        <div className="m-2 mt-auto flex h-9 flex-none items-center justify-between rounded-sm bg-surface-2 px-2.5 text-[12px] text-fg-subtle">
          <span className="tabular-nums">
            {t('mail.pagination', { page: currentPage, total: totalPage })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              aria-label={t('mail.pagination.prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={currentPage >= totalPage}
              onClick={() => setPage((prev) => Math.min(totalPage, prev + 1))}
              aria-label={t('mail.pagination.next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ---------------- 阅读 ---------------- */}
      <div
        className={cn(
          'min-h-0 min-w-0 overflow-hidden bg-surface md:rounded-xl md:border md:border-border-base md:shadow-e1',
          selectedId ? 'block' : 'hidden md:block',
        )}
      >
        <MailReader
        mail={detailQuery.data}
        loading={detailQuery.isLoading && Boolean(selectedId)}
        error={detailQuery.error ? errorText(detailQuery.error) : null}
        onReply={() => detailQuery.data && startCompose('reply', detailQuery.data)}
        onReplyAll={() => detailQuery.data && startCompose('replyAll', detailQuery.data)}
        onForward={() => detailQuery.data && startCompose('forward', detailQuery.data)}
        onDelete={() => {
          if (!selectedId) return
          deleteMutation.mutate([selectedId])
        }}
        moveTargets={readerMoveTargets}
        onMove={(groupId) => {
          if (!selectedId) return
          moveMutation.mutate({ ids: [selectedId], groupId })
        }}
        onToggleRead={() => selectedId && readMutation.mutate([selectedId])}
        onBack={() => setSearchParams({}, { replace: true })}
        />
      </div>
    </div>
  )
}
