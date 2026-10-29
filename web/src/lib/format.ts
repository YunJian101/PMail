import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

/** 列表里的时间：今天显示时刻，昨天显示「昨天」，一周内显示星期，更早显示日期 */
export function formatListTime(value?: string | number | null): string {
  if (!value) return ''
  const d = dayjs(value)
  if (!d.isValid()) return ''
  const now = dayjs()
  if (d.isSame(now, 'day')) return d.format('HH:mm')
  if (d.isSame(now.subtract(1, 'day'), 'day')) return '昨天'
  if (now.diff(d, 'day') < 7) return d.format('ddd')
  if (d.isSame(now, 'year')) return d.format('M月D日')
  return d.format('YYYY-MM-DD')
}

export function formatDateTime(value?: string | number | null): string {
  if (!value) return ''
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : ''
}

export function formatDate(value?: string | number | null): string {
  if (!value) return ''
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD') : ''
}

export function fromNow(value?: string | number | null): string {
  if (!value) return ''
  const d = dayjs(value)
  return d.isValid() ? d.fromNow() : ''
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 100 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`
}

/** 从 "张三 <a@b.com>" 里拆出名字与地址 */
export function parseAddress(raw: string): { name: string; email: string } {
  const text = (raw || '').trim()
  const match = text.match(/^(.*?)<([^>]+)>$/)
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, '')
    const email = match[2].trim()
    return { name: name || email.split('@')[0], email }
  }
  return { name: text.split('@')[0] || text, email: text }
}

/** 从 "张三 <a@b.com>, 李四 <c@d.com>" 里拆出多个地址 */
export function parseAddressList(raw: string): { name: string; email: string }[] {
  if (!raw) return []
  return raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseAddress)
}

/**
 * 后端把收件人存成 JSON 字符串（models.Email.To），格式可能是
 * `[{"Name":"张三","EmailAddress":"a@b.com"}]`，也可能是普通地址串。
 */
export function formatRecipients(raw: string, fallback = '—'): string {
  if (!raw) return fallback
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    try {
      const list = JSON.parse(trimmed) as { Name?: string; EmailAddress?: string; email?: string }[]
      const emails = list.map((item) => item.EmailAddress || item.email || '').filter(Boolean)
      if (emails.length > 0) return emails.join(', ')
    } catch {
      /* 解析失败就退回普通地址串处理 */
    }
  }
  const emails = parseAddressList(trimmed)
    .map((item) => item.email)
    .filter(Boolean)
  return emails.length > 0 ? emails.join(', ') : fallback
}

export function truncate(text: string, max = 120): string {  const clean = (text || '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/** HTML 正文转纯文本摘要（列表预览用） */
export function htmlToText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
