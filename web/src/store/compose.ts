import { create } from 'zustand'
import type { MailDetail } from '@/api/types'

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

interface ComposeState {
  open: boolean
  mode: ComposeMode
  /** 回复/转发时的原始邮件 */
  source: MailDetail | null
  /** 草稿续写时带上的邮件 id */
  draftId: number | null
  start: (mode?: ComposeMode, source?: MailDetail | null, draftId?: number | null) => void
  close: () => void
}

export const useCompose = create<ComposeState>((set) => ({
  open: false,
  mode: 'new',
  source: null,
  draftId: null,
  start: (mode = 'new', source = null, draftId = null) =>
    set({ open: true, mode, source, draftId }),
  close: () => set({ open: false, source: null, draftId: null }),
}))
