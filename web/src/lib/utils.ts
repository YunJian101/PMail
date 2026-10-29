import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 从任意字符串生成稳定的头像配色索引（同一个联系人永远同一个颜色） */
const AVATAR_TONES = ['blue', 'teal', 'violet', 'amber', 'rose', 'slate'] as const
export type AvatarTone = (typeof AVATAR_TONES)[number]

export function avatarTone(seed: string): AvatarTone {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

/** 取显示用首字母：中文取第一个字，英文取首字母，其它回退到 @ 前一位 */
export function initials(name: string, fallback = '?') {
  const trimmed = (name || '').trim()
  if (!trimmed) return fallback
  const first = Array.from(trimmed)[0]
  return /[a-z]/i.test(first) ? first.toUpperCase() : first
}
