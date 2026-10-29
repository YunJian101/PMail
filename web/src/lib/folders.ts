import type { SearchTag } from '@/api/types'

/** 后端约定的 5 个默认箱（tag 由 /api/group 下发，这里用于本地映射 URL） */
export const FOLDER_SLUGS = ['inbox', 'sent', 'drafts', 'junk', 'trash'] as const
export type DefaultFolderSlug = (typeof FOLDER_SLUGS)[number]

export const DEFAULT_TAGS: Record<DefaultFolderSlug, SearchTag> = {
  inbox: { type: 0, status: -1, group_id: 0 },
  sent: { type: 1, status: -1, group_id: 0 },
  drafts: { type: 0, status: 4, group_id: 0 },
  junk: { type: -1, status: 5, group_id: 0 },
  trash: { type: -1, status: 3, group_id: 0 },
}

/** 后端 models.Group 里的默认箱常量，移动邮件时要用 */
export const GROUP_CONST = {
  INBOX: 2000000000,
  SENT: 2000000001,
  DRAFTS: 2000000002,
  DELETED: 2000000003,
  JUNK: 2000000004,
} as const

export function parseTag(tag: string): SearchTag {
  try {
    const parsed = JSON.parse(tag) as Partial<SearchTag>
    return {
      type: typeof parsed.type === 'number' ? parsed.type : -1,
      status: typeof parsed.status === 'number' ? parsed.status : -1,
      group_id: typeof parsed.group_id === 'number' ? parsed.group_id : -1,
    }
  } catch {
    return { type: -1, status: -1, group_id: -1 }
  }
}

/** 把后端下发的 tag 映射成 URL slug，自定义分组用 group-<id> */
export function tagToSlug(tag: string): string {
  const parsed = parseTag(tag)
  for (const slug of FOLDER_SLUGS) {
    const candidate = DEFAULT_TAGS[slug]
    if (
      candidate.type === parsed.type &&
      candidate.status === parsed.status &&
      candidate.group_id === parsed.group_id
    ) {
      return slug
    }
  }
  if (parsed.group_id > 0) return `group-${parsed.group_id}`
  return 'inbox'
}

/** slug → SearchTag；无法识别的 slug 退回收件箱 */
export function slugToTag(slug?: string): SearchTag {
  if (!slug) return DEFAULT_TAGS.inbox
  if ((FOLDER_SLUGS as readonly string[]).includes(slug)) {
    return DEFAULT_TAGS[slug as DefaultFolderSlug]
  }
  const match = /^group-(\d+)$/.exec(slug)
  if (match) {
    return { type: -1, status: -1, group_id: Number(match[1]) }
  }
  return DEFAULT_TAGS.inbox
}

/** 该分组在「移动到」菜单里对应的默认箱常量 */
export function slugToMoveTarget(slug: string): number | null {
  switch (slug) {
    case 'inbox':
      return GROUP_CONST.INBOX
    case 'sent':
      return GROUP_CONST.SENT
    case 'drafts':
      return GROUP_CONST.DRAFTS
    case 'trash':
      return GROUP_CONST.DELETED
    case 'junk':
      return GROUP_CONST.JUNK
    default: {
      const match = /^group-(\d+)$/.exec(slug)
      return match ? Number(match[1]) : null
    }
  }
}

export const FOLDER_FALLBACK_LABEL: Record<DefaultFolderSlug, string> = {
  inbox: '收件箱',
  sent: '发件箱',
  drafts: '草稿箱',
  junk: '垃圾邮件',
  trash: '已删除',
}
