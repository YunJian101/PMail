import * as React from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Languages, Lock, Mail, Moon, ShieldCheck, Sun } from 'lucide-react'
import { toast, errorText } from '@/lib/toast'
import { useSession } from '@/store/session'
import { useTheme } from '@/theme/theme-provider'
import { LANGUAGES, currentLanguage, setLanguage } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { VersionTag } from '@/components/ui/version-tag'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const status = useSession((state) => state.status)
  const signIn = useSession((state) => state.signIn)
  const { resolved, toggle } = useTheme()

  const [account, setAccount] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  /** 登录失败原因（例如「账号已被停用」），常驻在表单上方，不像 toast 一闪就没 */
  const [errorMsg, setErrorMsg] = React.useState('')

  /** RequireAuth 跳过来时带了原始路径，登录后回到那里 */
  const from = (location.state as { from?: string } | null)?.from

  const language = currentLanguage()
  const nextLanguage = LANGUAGES.find((item) => item.value !== language) ?? LANGUAGES[0]

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setErrorMsg('')
    if (!account.trim() || !password) {
      toast.error(t('login.fillRequired'))
      return
    }
    setSubmitting(true)
    try {
      await signIn(account.trim(), password)
      navigate(from ?? '/mail/inbox', { replace: true })
    } catch (error) {
      const detail = errorText(error)
      setErrorMsg(detail)
      toast.error(t('login.failed'), detail)
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'authenticated') return <Navigate to="/mail/inbox" replace />

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg">
      {/* 右上角：语言 / 主题，只有两个小按钮 */}
      <div className="flex flex-none items-center justify-end gap-1 px-3 py-3 sm:px-5 sm:py-4">
        <Tooltip label={t('common.language')}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(nextLanguage.value)}
            aria-label={t('common.language')}
          >
            <Languages className="h-4 w-4" />
            <span className="text-[12px]">{nextLanguage.label}</span>
          </Button>
        </Tooltip>
        <Tooltip label={resolved === 'dark' ? t('common.themeLight') : t('common.themeDark')}>
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t('common.theme')}>
            {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </Tooltip>
      </div>

      {/* 中间：一张窄卡片，手机端就是全宽 */}
      <div className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-[368px]">
          <div className="mb-8 flex flex-col items-center">
            <div className="grid h-12 w-12 place-items-center rounded-md bg-gradient-to-br from-[#4f83ff] to-[#0ea5c6] shadow-[0_10px_24px_-12px_rgba(37,99,235,.9)]">
              <svg
                viewBox="0 0 24 24"
                className="h-[22px] w-[22px]"
                fill="none"
                stroke="#fff"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
                <path d="m3.5 7 7.4 5.3a2 2 0 0 0 2.2 0L20.5 7" />
              </svg>
            </div>
            <div className="mt-3 text-[17px] font-[700] tracking-[-0.01em]">PMail</div>
          </div>

          <form onSubmit={onSubmit} noValidate>
            {errorMsg ? (
              <div
                role="alert"
                className="mb-3.5 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-danger"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" />
                <span className="min-w-0 break-words">{errorMsg}</span>
              </div>
            ) : null}

            <Field label={t('login.account')}>
              <Input
                value={account}
                onChange={(event) => {
                  setAccount(event.target.value)
                  setErrorMsg('')
                }}
                placeholder={t('login.accountPlaceholder')}
                autoComplete="username"
                inputMode="email"
                autoFocus
                leading={<Mail className="h-4 w-4" />}
                className="h-12 text-[16px] sm:text-[14px]"
              />
            </Field>

            <Field label={t('login.password')}>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setErrorMsg('')
                }}
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                leading={<Lock className="h-4 w-4" />}
                className="h-12 text-[16px] sm:text-[14px]"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="inline-flex h-8 items-center gap-1 px-1 text-[11.5px] font-[600] text-fg-muted transition-colors hover:text-fg"
                    aria-label={showPassword ? t('login.hide') : t('login.show')}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                }
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              className="mt-1.5 h-12 w-full rounded-md text-[15px]"
              disabled={submitting}
            >
              {submitting ? t('common.loading') : t('login.submit')}
            </Button>
          </form>

          <div className="mt-8 flex justify-center">
            <VersionTag />
          </div>
        </div>
      </div>
    </div>
  )
}
