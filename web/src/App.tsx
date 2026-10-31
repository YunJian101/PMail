import * as React from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { setRedirectHandler } from '@/api/client'
import { useSession } from '@/store/session'
import { useSessionRefreshOnFocus } from '@/lib/use-session-refresh'
import { Spinner } from '@/components/ui/skeleton'
import LoginPage from '@/pages/login'
import SetupPage from '@/pages/setup'
import MailLayout from '@/layouts/mail-layout'
import AdminLayout from '@/layouts/admin-layout'
import { InboxPage } from '@/pages/mail/inbox'
import { UsersPage } from '@/pages/admin/users'
import { FoldersPage } from '@/pages/admin/folders'
import { RulesPage } from '@/pages/admin/rules'
import { PluginsPage } from '@/pages/admin/plugins'
import AccountPage from '@/pages/account'
import { SettingsPage } from '@/pages/admin/settings'

function BootScreen() {
  return (
    <div className="grid h-full place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#4f83ff] to-[#0ea5c6] shadow-[0_8px_24px_-8px_rgba(37,99,235,.6)]">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth={1.9}>
            <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
            <path d="m3.5 7 7.4 5.3a2 2 0 0 0 2.2 0L20.5 7" strokeLinecap="round" />
          </svg>
        </div>
        <Spinner />
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useSession((state) => state.status)
  const user = useSession((state) => state.user)
  const location = useLocation()
  // 已经有用户信息时不要因为一次静默刷新就卸载页面：
  // 卸载会连带销毁写信浮层，正在写的内容就丢了。
  if (!user && (status === 'loading' || status === 'idle')) return <BootScreen />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useSession((state) => state.user)
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_admin) return <Navigate to="/mail/inbox" replace />
  return <>{children}</>
}

export default function App() {
  const navigate = useNavigate()
  const load = useSession((state) => state.load)
  const status = useSession((state) => state.status)
  const needsSetup = useSession((state) => state.needsSetup)

  // 回到这个窗口时静默刷新会话：改名、被停用之类的变化能及时反映出来
  useSessionRefreshOnFocus()

  // 后端用 errorNo 402/403 表示「未安装 / 未登录」，统一在这里跳转
  React.useEffect(() => {
    setRedirectHandler((kind) => {
      navigate(kind === 'setup' ? '/setup' : '/login', { replace: true })
    })
  }, [navigate])

  React.useEffect(() => {
    void load()
  }, [load])

  if (status === 'idle' || status === 'loading') return <BootScreen />

  // 服务端还没装好：除了安装向导，其它页面一律送回去
  if (needsSetup) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />

      <Route
        path="/mail"
        element={
          <RequireAuth>
            <MailLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/mail/inbox" replace />} />
        <Route path="settings" element={<AccountPage />} />
        <Route path=":folder" element={<InboxPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<Navigate to="/admin/users" replace />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="folders" element={<FoldersPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="plugins" element={<PluginsPage />} />

        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/mail/inbox" replace />} />
    </Routes>
  )
}
