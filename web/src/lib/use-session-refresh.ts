import * as React from 'react'
import { useSession } from '@/store/session'

/**
 * 窗口重新可见 / 重新获得焦点时静默刷新一次会话。
 * 这样改过显示名、或者账号被停用之后，挂着的页面（包括其它标签页）也能跟上，
 * 不用手动刷新。10 秒内只刷一次，避免来回切窗口时打请求。
 */
export function useSessionRefreshOnFocus() {
  const load = useSession((state) => state.load)

  React.useEffect(() => {
    let last = 0
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - last < 10_000) return
      last = now
      void load(true)
    }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])
}
