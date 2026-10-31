import { create } from 'zustand'
import { ApiError } from '@/api/client'
import { fetchSession, login as apiLogin, logout as apiLogout } from '@/api/auth'
import type { SessionUser } from '@/api/types'

/** 后端把 is_admin 当 int 返回（0/1），这里统一收敛成 boolean */
type RawSessionUser = Omit<SessionUser, 'is_admin'> & { is_admin: boolean | number }

function normalize(raw: RawSessionUser): SessionUser {
  return {
    account: raw.account ?? '',
    name: raw.name ?? raw.account ?? '',
    is_admin: Boolean(raw.is_admin),
    domains: raw.domains ?? [],
  }
}

type Status = 'idle' | 'loading' | 'authenticated' | 'anonymous'

interface SessionState {
  user: SessionUser | null
  status: Status
  /** 服务端返回 402：还没完成安装，此时任何页面都应该先去安装向导 */
  needsSetup: boolean
  /** 上一次鉴权失败的原因，登录页用来提示 */
  lastError: string | null
  load: (force?: boolean) => Promise<SessionUser | null>
  signIn: (account: string, password: string) => Promise<SessionUser>
  signOut: () => Promise<void>
  /** 本地直接写会话（登录接口已经返回了完整信息） */
  setUser: (user: SessionUser) => void
  clear: () => void
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  status: 'idle',
  needsSetup: false,
  lastError: null,

  async load(force = false) {
    const current = get()
    if (!force && current.status !== 'idle') return current.user

    // 已经登录时做「静默刷新」：不能把 status 切回 loading，
    // 否则 RequireAuth 会整棵邮件布局卸载，正在写的信（收件人/正文/附件）会被清空。
    const silent = current.status === 'authenticated'
    if (!silent) set({ status: 'loading' })

    try {
      const raw = (await fetchSession()) as unknown as RawSessionUser
      const user = normalize(raw)
      set({ user, status: 'authenticated', needsSetup: false, lastError: null })
      return user
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 0
      const needsSetup = code === 402
      const kicked = code === 402 || code === 403

      // 静默刷新时，只有「真的被踢下线 / 未安装」才降级；
      // 网络抖动就保持原状态，别把用户丢到登录页。
      if (silent && !kicked) {
        set({ lastError: (error as Error)?.message ?? null })
        return current.user
      }

      set({
        user: null,
        status: 'anonymous',
        needsSetup,
        lastError: (error as Error)?.message ?? null,
      })
      return null
    }
  },

  async signIn(account, password) {
    const raw = (await apiLogin(account, password)) as unknown as RawSessionUser
    const user = normalize(raw)
    set({ user, status: 'authenticated', needsSetup: false, lastError: null })
    return user
  },

  async signOut() {
    try {
      await apiLogout()
    } finally {
      set({ user: null, status: 'anonymous' })
    }
  },

  setUser(user) {
    set({ user, status: 'authenticated', needsSetup: false, lastError: null })
  },

  clear() {
    set({ user: null, status: 'anonymous' })
  },
}))

export function useCurrentUser() {
  return useSession((state) => state.user)
}

export function useIsAdmin() {
  return useSession((state) => Boolean(state.user?.is_admin))
}
