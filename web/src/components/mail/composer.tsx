import * as React from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import ImageExtension from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Bold,
  Code2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  Send,
  Strikethrough,
  Underline as UnderlineIcon,
  X,
} from 'lucide-react'
import { fileToDataUrl, sendMail } from '@/api/mail'
import type { SendMailAttachment, SendMailUser } from '@/api/types'
import { cn } from '@/lib/utils'
import { formatBytes, formatDateTime, parseAddress, parseAddressList } from '@/lib/format'
import { sanitizeMailHtml } from '@/lib/sanitize'
import { toast, errorText } from '@/lib/toast'
import { useCompose } from '@/store/compose'
import { useSession } from '@/store/session'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface PendingAttachment {
  id: string
  name: string
  size: number
  data: string
}

function TagInput({
  values,
  onChange,
  placeholder,
  autoFocus,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [draft, setDraft] = React.useState('')

  const commit = (raw: string) => {
    const candidates = raw
      .split(/[,;，；\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (candidates.length === 0) return
    const next = [...values]
    candidates.forEach((item) => {
      if (!next.includes(item)) next.push(item)
    })
    onChange(next)
    setDraft('')
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex h-6 items-center gap-1 rounded-md bg-primary-soft pl-2 pr-1 text-[12px] font-[550] text-primary"
        >
          {value}
          <button
            type="button"
            onClick={() => onChange(values.filter((item) => item !== value))}
            className="grid h-4 w-4 place-items-center rounded hover:bg-[var(--ring)]"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        autoFocus={autoFocus}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',' || event.key === ';' || event.key === 'Tab') {
            if (draft.trim()) {
              event.preventDefault()
              commit(draft)
            }
          } else if (event.key === 'Backspace' && !draft && values.length > 0) {
            onChange(values.slice(0, -1))
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={values.length === 0 ? placeholder : ''}
        className="min-w-[130px] flex-1 border-0 bg-transparent py-1 text-[13.5px] text-fg outline-none placeholder:text-fg-subtle"
      />
    </div>
  )
}

export function Composer() {
  const { t } = useTranslation()
  const { open, mode, source, close } = useCompose()
  const user = useSession((state) => state.user)
  const queryClient = useQueryClient()

  const domains = user?.domains?.length ? user.domains : ['']
  const [domain, setDomain] = React.useState(domains[0])
  const [to, setTo] = React.useState<string[]>([])
  const [cc, setCc] = React.useState<string[]>([])
  const [bcc, setBcc] = React.useState<string[]>([])
  const [subject, setSubject] = React.useState('')
  const [showCc, setShowCc] = React.useState(false)
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([])
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const fromAddress = user?.account ? `${user.account.split('@')[0]}@${domain}` : ''

  const initialContent = React.useMemo(() => {
    if (!source) return '<p></p>'

    const when = source.send_date ? formatDateTime(source.send_date) : ''
    const who = source.from_name
      ? `${source.from_name} <${source.from_address}>`
      : source.from_address
    const header = `<p>${t('compose.quoteHeader', { when, who })}</p>`

    // 优先保留原文的 HTML 排版；没有 HTML 才退回纯文本逐行
    const html = (source.html || '').trim()
    const body = html
      ? sanitizeMailHtml(html, source.id)
      : (source.text || '')
          .split('\n')
          .map((line) => (line.trim() ? `<p>${line}</p>` : '<p></p>'))
          .join('')

    if (!body.trim()) return '<p></p>'
    return `<p></p><blockquote>${header}${body}</blockquote>`
  }, [source, t])

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        Underline,
        LinkExtension.configure({ openOnClick: false, autolink: true }),
        ImageExtension.configure({ inline: false }),
        Placeholder.configure({ placeholder: t('compose.bodyPlaceholder') }),
      ],
      content: initialContent,
      editorProps: {
        attributes: {
          class:
            'tiptap mail-body min-h-[220px] px-5 py-4 text-[14px] leading-[1.75] outline-none',
        },
      },
    },
    [initialContent],
  )

  // 打开时重置状态
  React.useEffect(() => {
    if (!open) return
    setDomain(domains[0] ?? '')
    setAttachments([])
    setShowCc(false)

    if (mode === 'new' || !source) {
      setTo([])
      setCc([])
      setBcc([])
      setSubject('')
      return
    }

    const own = user?.account ?? ''
    const fromParsed = parseAddress(source.from_address || '')
    if (mode === 'reply') {
      setTo(fromParsed.email ? [fromParsed.email] : [])
      setCc([])
      setBcc([])
      setSubject(source.subject?.startsWith('Re:') ? source.subject : `Re: ${source.subject ?? ''}`)
    } else if (mode === 'replyAll') {
      const all = [
        fromParsed.email,
        ...parseAddressList(source.to).map((item) => item.email),
        ...parseAddressList(source.cc).map((item) => item.email),
      ].filter((email) => email && email !== own)
      setTo(Array.from(new Set(all)))
      setCc([])
      setBcc([])
      setShowCc(true)
      setSubject(source.subject?.startsWith('Re:') ? source.subject : `Re: ${source.subject ?? ''}`)
    } else {
      setTo([])
      setCc([])
      setBcc([])
      setSubject(source.subject?.startsWith('Fwd:') ? source.subject : `Fwd: ${source.subject ?? ''}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, source?.id])

  const sendMutation = useMutation({
    mutationFn: async () => {
      const recipients = [...to, ...cc, ...bcc]
      if (recipients.length === 0) throw new Error(t('compose.errNoRecipient'))
      const invalid = recipients.find((email) => !EMAIL_RE.test(email))
      if (invalid) throw new Error(t('compose.errBadEmail', { email: invalid }))
      if (!subject.trim()) throw new Error(t('compose.errNoSubject'))

      const toUsers: SendMailUser[] = to.map((email) => ({ name: '', email }))
      const ccUsers: SendMailUser[] = cc.map((email) => ({ name: '', email }))
      const bccUsers: SendMailUser[] = bcc.map((email) => ({ name: '', email }))
      const attrs: SendMailAttachment[] = attachments.map((item) => ({
        name: item.name,
        data: item.data,
      }))

      return sendMail({
        from: { name: user?.name ?? '', email: fromAddress },
        to: toUsers,
        cc: ccUsers,
        bcc: bccUsers,
        subject: subject.trim(),
        text: editor?.getText() ?? '',
        html: editor?.getHTML() ?? '',
        attrs,
      })
    },
    onSuccess: () => {
      toast.success(t('compose.sendSuccess'))
      queryClient.invalidateQueries({ queryKey: ['mail-list'] })
      close()
    },
    onError: (error) => toast.error(t('compose.sendFailed'), errorText(error)),
  })

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const next: PendingAttachment[] = []
    for (const file of Array.from(files)) {
      if (file.size > 15 * 1024 * 1024) {
        toast.error(t('compose.attachmentTooLarge'), file.name)
        continue
      }
      try {
        const data = await fileToDataUrl(file)
        next.push({
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          data,
        })
      } catch (error) {
        // 读文件失败以前是静默丢弃，用户以为加上了其实没有
        toast.error(t('compose.attachmentFailed'), `${file.name}${errorText(error) ? ` · ${errorText(error)}` : ''}`)
      }
    }
    setAttachments((prev) => [...prev, ...next])
    if (fileRef.current) fileRef.current.value = ''
  }

  if (!open) return null

  const title =
    mode === 'reply' ? t('compose.replyTitle') : mode === 'forward' ? t('compose.forwardTitle') : t('compose.title')

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-[rgba(9,14,26,.5)] p-6 backdrop-blur-[3px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="flex max-h-[86vh] w-full max-w-[780px] flex-col overflow-hidden rounded-xl border border-border-base bg-surface shadow-e3">
        <div className="flex items-center gap-2.5 border-b border-border-base bg-surface-2 px-4 py-3">
          <b className="text-[13.5px] font-[650]">{title}</b>
          {sendMutation.isPending ? (
            <span className="text-[11.5px] text-fg-subtle">{t('compose.sending')}</span>
          ) : null}
          <button
            type="button"
            onClick={close}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-fg-subtle hover:bg-surface-3 hover:text-fg"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5">
          <div className="flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] py-2.5">
            <span className="w-[52px] flex-none text-[12.5px] text-fg-subtle">{t('compose.from')}</span>
            <Select
              variant="plain"
              className="flex-1"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            >
              {domains.map((item) => (
                <option key={item} value={item}>
                  {user?.account?.split('@')[0]}@{item}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] py-2">
            <span className="w-[52px] flex-none text-[12.5px] text-fg-subtle">{t('compose.to')}</span>
            <TagInput values={to} onChange={setTo} placeholder={t('compose.recipientPlaceholder')} autoFocus />
            <button
              type="button"
              onClick={() => setShowCc((prev) => !prev)}
              className="flex-none text-[12px] text-fg-subtle hover:text-primary"
            >
              {showCc ? t('compose.hideCc') : t('compose.showCc')}
            </button>
          </div>

          {showCc ? (
            <>
              <div className="flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] py-2">
                <span className="w-[52px] flex-none text-[12.5px] text-fg-subtle">{t('compose.cc')}</span>
                <TagInput values={cc} onChange={setCc} />
              </div>
              <div className="flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] py-2">
                <span className="w-[52px] flex-none text-[12.5px] text-fg-subtle">{t('compose.bcc')}</span>
                <TagInput values={bcc} onChange={setBcc} />
              </div>
            </>
          ) : null}

          <div className="flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] py-2.5">
            <span className="w-[52px] flex-none text-[12.5px] text-fg-subtle">{t('compose.subject')}</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t('compose.subjectPlaceholder')}
              className="w-full border-0 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-fg-subtle"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-0.5 border-b border-border-base/70 px-4 py-1.5 text-fg-muted">
          {[
            {
              icon: <Bold className="h-4 w-4" />,
              active: editor?.isActive('bold'),
              action: () => editor?.chain().focus().toggleBold().run(),
              label: t('compose.tool.bold'),
            },
            {
              icon: <Italic className="h-4 w-4" />,
              active: editor?.isActive('italic'),
              action: () => editor?.chain().focus().toggleItalic().run(),
              label: t('compose.tool.italic'),
            },
            {
              icon: <UnderlineIcon className="h-4 w-4" />,
              active: editor?.isActive('underline'),
              action: () => editor?.chain().focus().toggleUnderline().run(),
              label: t('compose.tool.underline'),
            },
            {
              icon: <Strikethrough className="h-4 w-4" />,
              active: editor?.isActive('strike'),
              action: () => editor?.chain().focus().toggleStrike().run(),
              label: t('compose.tool.strike'),
            },
            {
              icon: <List className="h-4 w-4" />,
              active: editor?.isActive('bulletList'),
              action: () => editor?.chain().focus().toggleBulletList().run(),
              label: t('compose.tool.bulletList'),
            },
            {
              icon: <ListOrdered className="h-4 w-4" />,
              active: editor?.isActive('orderedList'),
              action: () => editor?.chain().focus().toggleOrderedList().run(),
              label: t('compose.tool.orderedList'),
            },
            {
              icon: <Quote className="h-4 w-4" />,
              active: editor?.isActive('blockquote'),
              action: () => editor?.chain().focus().toggleBlockquote().run(),
              label: t('compose.tool.quote'),
            },
            {
              icon: <Code2 className="h-4 w-4" />,
              active: editor?.isActive('codeBlock'),
              action: () => editor?.chain().focus().toggleCodeBlock().run(),
              label: t('compose.tool.code'),
            },
            {
              icon: <LinkIcon className="h-4 w-4" />,
              active: editor?.isActive('link'),
              action: () => {
                const url = window.prompt(t('compose.linkPrompt'), 'https://')
                if (!url) return
                editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
              },
              label: t('compose.tool.link'),
            },
          ].map((tool) => (
            <Tooltip key={tool.label} label={tool.label}>
              <button
                type="button"
                onClick={tool.action}
                className={cn(
                  'grid h-7 w-[30px] place-items-center rounded-xs hover:bg-surface-3 hover:text-fg',
                  tool.active && 'bg-primary-soft text-primary',
                )}
              >
                {tool.icon}
              </button>
            </Tooltip>
          ))}
          <div className="mx-1.5 h-4 w-px bg-border-base" />
          <Tooltip label={t('compose.attach')}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid h-7 w-[30px] place-items-center rounded-xs hover:bg-surface-3 hover:text-fg"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>

        {/* 附件条固定在正文与发送栏之间，不跟正文一起滚动，加多少都看得见 */}
        {attachments.length > 0 ? (
          <div className="flex max-h-[110px] flex-wrap gap-2 overflow-y-auto border-t border-border-base bg-surface px-4 py-2.5">
            {attachments.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-2 rounded-lg border border-border-base bg-surface-2 px-2.5 py-1.5 text-[12px]"
              >
                <Paperclip className="h-3.5 w-3.5 text-fg-subtle" />
                <span className="max-w-[220px] truncate font-[550]">{item.name}</span>
                <span className="text-[11px] text-fg-subtle">{formatBytes(item.size)}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((row) => row.id !== item.id))}
                  className="grid h-4 w-4 place-items-center rounded text-fg-subtle hover:bg-surface-3 hover:text-danger"
                  aria-label={t('compose.removeAttachment')}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 border-t border-border-base bg-surface-2 px-4 py-3">
          <Button
            variant="primary"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending}
          >
            <Send className="h-4 w-4" />
            {sendMutation.isPending ? t('compose.sending') : t('compose.send')}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => fileRef.current?.click()}
            aria-label={t('compose.attach')}
            className="relative"
          >
            <Paperclip className="h-4 w-4" />
            {attachments.length > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-[700] leading-none text-primary-fg">
                {attachments.length}
              </span>
            ) : null}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={close}>
              {t('compose.discard')}
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(event) => void handleFiles(event.target.files)}
          />
        </div>
      </div>
    </div>
  )
}
