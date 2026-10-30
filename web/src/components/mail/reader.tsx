import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  FolderInput,
  Forward,
  Image as ImageIcon,
  Mail,
  MailOpen,
  Paperclip,
  Reply,
  ReplyAll,
  Trash2,
} from 'lucide-react'
import type { MailAttachmentMeta, MailDetail } from '@/api/types'
import { attachmentDownloadUrl, triggerDownload } from '@/api/mail'
import { parseAddressList, formatDateTime, formatRecipients } from '@/lib/format'
import { sanitizeMailHtml } from '@/lib/sanitize'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from '@/components/ui/dropdown'

function attachmentTone(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf'].includes(ext)) return { label: 'PDF', cls: 'from-[#fb7185] to-[#c81e4b]' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: 'XLS', cls: 'from-[#34d399] to-[#0b8a63]' }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext))
    return { label: 'IMG', cls: 'from-[#a78bfa] to-[#6d3bef]' }
  if (['doc', 'docx', 'rtf'].includes(ext)) return { label: 'DOC', cls: 'from-[#4f83ff] to-[#2c57d6]' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { label: 'ZIP', cls: 'from-[#fbbf24] to-[#e07a0c]' }
  return { label: ext.slice(0, 3).toUpperCase() || 'FILE', cls: 'from-[#94a3b8] to-[#5a6a80]' }
}

function AttachmentCard({ item, emailId }: { item: MailAttachmentMeta; emailId: number }) {
  const tone = attachmentTone(item.Filename)
  return (
    <button
      type="button"
      onClick={() => triggerDownload(attachmentDownloadUrl(emailId, item.Index))}
      className="flex w-[232px] items-center gap-2.5 rounded-sm border border-border-base bg-surface-2 px-2.5 py-2 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-e2"
    >
      <span
        className={cn(
          'grid h-[34px] w-[34px] flex-none place-items-center rounded-lg bg-gradient-to-br text-[10px] font-[800] text-white',
          tone.cls,
        )}
      >
        {tone.label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-[600]">{item.Filename}</span>
        <span className="block text-[11px] text-fg-subtle">{item.ContentType || 'attachment'}</span>
      </span>
      <Download className="h-3.5 w-3.5 flex-none text-fg-subtle" />
    </button>
  )
}

export interface ReaderProps {
  mail?: MailDetail
  loading?: boolean
  error?: string | null
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
  onDelete: () => void
  /** 可移动到的文件夹（排除当前所在），点哪个移哪个 */
  moveTargets: { label: string; groupId: number }[]
  onMove: (groupId: number) => void
  onToggleRead?: () => void
  /** 当前这封是否未读：决定按钮是「标为已读」还是「标为未读」 */
  isUnread?: boolean
  /** 窄屏下从阅读区返回列表 */
  onBack?: () => void
}

export function MailReader({
  mail,
  loading,
  error,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  moveTargets,
  onMove,
  onToggleRead,
  isUnread = false,
  onBack,
}: ReaderProps) {
  const { t } = useTranslation()

  const html = React.useMemo(() => (mail ? sanitizeMailHtml(mail.html, mail.id) : ''), [mail])
  const bodyRef = React.useRef<HTMLDivElement | null>(null)

  // 纯文本正文按段落渲染，避免整段挤成一坨
  const textParagraphs = React.useMemo(() => {
    if (!mail || mail.html) return []
    return (mail.text || '')
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
  }, [mail])

  const from = mail ? parseAddressList(mail.from_address || mail.from_name)[0] : undefined
  const displayName = mail?.from_name || from?.name || from?.email || ''
  const attachments = mail?.attachments ?? []

  if (loading) {
    return (
      <div className="flex h-full flex-col bg-surface">
        <div className="h-14 border-b border-border-base/70" />
        <div className="mx-auto w-full max-w-[760px] space-y-4 px-10 py-8">
          <Skeleton className="h-7 w-[70%]" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <div className="space-y-2.5 pt-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className={index === 5 ? 'h-3 w-[45%]' : 'h-3 w-full'} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title={t('mail.detail.notFound')}
          description={error}
        />
      </div>
    )
  }

  if (!mail) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <EmptyState
          icon={<MailOpen className="h-5 w-5" />}
          title={t('mail.detail.empty')}
          description={t('mail.detail.emptyDesc')}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-surface">
      <div className="flex h-14 flex-none items-center gap-0.5 px-3.5">
        {onBack ? (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onBack}
            aria-label={t('common.back')}
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Button>
        ) : null}
        <Tooltip label={t('mail.action.delete')}>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-[18px] w-[18px]" />
          </Button>
        </Tooltip>
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('mail.action.moveTo')} disabled={moveTargets.length === 0}>
              <FolderInput className="h-[18px] w-[18px]" />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="start">
            {moveTargets.map((target) => (
              <DropdownItem key={target.groupId} onSelect={() => onMove(target.groupId)}>
                <FolderInput className="h-3.5 w-3.5" />
                {target.label}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
        <Tooltip label={isUnread ? t('mail.action.markRead') : t('mail.action.markUnread')}>
          <Button variant="ghost" size="icon" onClick={onToggleRead}>
            {isUnread ? (
              <MailOpen className="h-[18px] w-[18px]" />
            ) : (
              <Mail className="h-[18px] w-[18px]" />
            )}
          </Button>
        </Tooltip>
        <div className="mx-1.5 h-[18px] w-px bg-border-base" />

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" onClick={onReply}>
            <Reply className="h-4 w-4" />
            {t('mail.action.reply')}
          </Button>
          <Button variant="secondary" onClick={onForward}>
            <Forward className="h-4 w-4" />
            {t('mail.action.forward')}
          </Button>
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('common.more')}>
                <span className="text-[15px] leading-none">⋯</span>
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem onSelect={onReplyAll}>
                <ReplyAll className="h-3.5 w-3.5" />
                {t('mail.action.replyAll')}
              </DropdownItem>

            </DropdownContent>
          </Dropdown>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-10 pb-14 pt-7">
          <h1 className="mb-4 text-[24px] font-[700] leading-[1.3] tracking-[-0.025em]">
            {mail.subject || t('mail.noSubject')}
          </h1>

          <div className="flex items-center gap-3 pb-4">
            <Avatar name={displayName} email={from?.email} size={40} className="text-[15px]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[14px] font-[650]">
                <span className="truncate">{displayName || from?.email}</span>
                {mail.spf_check === 0 || mail.dkim_check === 0 ? (
                  <Badge tone="warning">{t('mail.dangerous')}</Badge>
                ) : null}
              </div>
              <div className="truncate text-[12.5px] text-fg-subtle">{from?.email}</div>
              <div className="truncate text-[12.5px] text-fg-subtle">
                {t('mail.detail.to')} {formatRecipients(mail.to)}
              </div>
            </div>
            <div className="whitespace-nowrap text-right text-[12px] text-fg-subtle">
              {formatDateTime(mail.send_date || mail.create_time)}
            </div>
          </div>

          <hr className="mb-5 border-0 border-t border-border-base/70" />

          {html ? (
            <div
              ref={bodyRef}
              className="mail-body"
              // 已在 sanitizeMailHtml 里剔除脚本、事件属性与 javascript: 协议
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className="mail-body">
              {textParagraphs.length > 0 ? (
                textParagraphs.map((block, index) => (
                  <p key={index} className="whitespace-pre-wrap">
                    {block}
                  </p>
                ))
              ) : (
                <p className="text-fg-subtle">{t('common.empty')}</p>
              )}
            </div>
          )}

          {attachments.length > 0 ? (
            <>
              <div className="mb-2.5 mt-7 flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 text-fg-subtle" />
                <span className="text-[10.5px] font-[700] uppercase tracking-[0.1em] text-fg-subtle">
                  {t('mail.detail.attachments', { count: attachments.length })}
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {attachments.map((item) => (
                  <AttachmentCard key={`${item.Index}-${item.Filename}`} item={item} emailId={mail.id} />
                ))}
              </div>
            </>
          ) : null}

          <button
            type="button"
            onClick={onReply}
            className="mt-8 flex w-full items-center gap-2.5 rounded-md border border-border-base bg-surface-2 px-3.5 py-3 text-left text-[13px] text-fg-subtle transition-colors hover:border-border-strong"
          >
            <Reply className="h-4 w-4" />
            {t('mail.detail.replyPlaceholder', { name: displayName || from?.email || '' })}
            <Paperclip className="ml-auto h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export const ATTACHMENT_ICONS = {
  file: FileText,
  sheet: FileSpreadsheet,
  image: ImageIcon,
}
