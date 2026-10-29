import * as React from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Languages, Lock, Mail, Moon, Send, Server, ShieldCheck, Sun } from 'lucide-react'
import { toast, errorText } from '@/lib/toast'
import { useSession } from '@/store/session'
import { useTheme } from '@/theme/theme-provider'
import { LANGUAGES, currentLanguage, setLanguage } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'

/** 左侧品牌区的三张特性卡，文案 key 成对出现（xxx / xxxDesc） */
const FEATURES = [
  { key: 'protocols', icon: <Server className="h-[15px] w-[15px]" strokeWidth={1.8} /> },
  { key: 'ssl', icon: <ShieldCheck className="h-[15px] w-[15px]" strokeWidth={1.8} /> },
  { key: 'deliver', icon: <Send className="h-[15px] w-[15px]" strokeWidth={1.8} /> },
]

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

  /** RequireAuth 跳过来时带了原始路径，登录后回到那里 */
  const from = (location.state as { from?: string } | null)?.from

  const language = currentLanguage()
  const nextLanguage = LANGUAGES.find((item) => item.value !== language) ?? LANGUAGES[0]

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    if (!account.trim() || !password) {
      toast.error(t('login.fillRequired'))
      return
    }
    setSubmitting(true)
    try {
      await signIn(account.trim(), password)
      navigate(from ?? '/mail/inbox', { replace: true })
    } catch (error) {
      toast.error(t('login.failed'), errorText(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'authenticated') return <Navigate to="/mail/inbox" replace />

  return (
    <div className="grid h-full min-h-0 grid-cols-[1.05fr_.95fr] overflow-hidden bg-bg">
      {/* ---------------- 品牌区 ---------------- */}
      <section className="relative flex h-full min-h-0 flex-col justify-between overflow-hidden bg-[radial-gradient(120%_90%_at_15%_10%,#2F63E8_0%,#1B3AA8_45%,#0B1B4D_100%)] px-12 py-11 text-white">
        {/* 氛围光斑：全部限制在 overflow-hidden 容器内，不会撑出滚动条 */}
        <span className="pointer-events-none absolute -left-24 -top-24 h-[340px] w-[340px] rounded-full bg-[#5B8CFF] opacity-55 blur-[60px]" />
        <span className="pointer-events-none absolute -bottom-28 -right-20 h-[320px] w-[320px] rounded-full bg-[#22D3EE] opacity-55 blur-[60px]" />
        <span className="pointer-events-none absolute right-6 top-[38%] h-[180px] w-[180px] rounded-full bg-[#7C9CFF] opacity-55 blur-[60px]" />

        <div className="relative my-auto w-full max-w-[470px]">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-[10px] border border-white/25 bg-white/15 backdrop-blur-sm">
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px]"
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
            <span className="text-[15px] font-[700] tracking-[-0.01em]">{t('app.name')}</span>
          </div>

          <h1 className="mt-10 max-w-[440px] text-[34px] font-[700] leading-[1.18] tracking-[-0.03em]">
            {t('app.tagline')}
          </h1>
          <p className="mt-4 max-w-[400px] text-[13.5px] leading-relaxed text-white/70">
            {t('app.description')}
          </p>

          <div className="mt-9 flex flex-col gap-2.5">
            {FEATURES.map((feature) => (
              <div
                key={feature.key}
                className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/10 px-3.5 py-3 backdrop-blur-sm"
              >
                <span className="mt-px grid h-8 w-8 flex-none place-items-center rounded-lg bg-white/15">
                  {feature.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-[650]">{t(`login.feature.${feature.key}`)}</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-white/65">
                    {t(`login.feature.${feature.key}Desc`)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative mt-10 text-[11.5px] text-white/45">{t('app.footer')}</p>
      </section>

      {/* ---------------- 表单区 ---------------- */}
      <section className="relative flex h-full min-h-0 flex-col bg-surface">
        <div className="flex flex-none items-center justify-end gap-1 px-5 py-4">
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
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label={t('common.theme')}
            >
              {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </Tooltip>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 pb-12">
          <div className="w-full max-w-[352px]">
            <h2 className="text-[20px] font-[700] tracking-[-0.02em]">{t('login.title')}</h2>
            <p className="mt-1 text-[12.5px] text-fg-muted">{t('login.subtitle')}</p>

            <form className="mt-7" onSubmit={onSubmit} noValidate>
              <Field label={t('login.account')}>
                <Input
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  placeholder={t('login.accountPlaceholder')}
                  autoComplete="username"
                  inputMode="email"
                  autoFocus
                  leading={<Mail className="h-4 w-4" />}
                />
              </Field>

              <Field label={t('login.password')}>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  autoComplete="current-password"
                  leading={<Lock className="h-4 w-4" />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11.5px] font-[600] text-fg-muted transition-colors hover:text-fg"
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {showPassword ? t('login.hide') : t('login.show')}
                    </button>
                  }
                />
              </Field>

              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="mt-2 h-10 w-full text-[14px]"
              >
                {submitting ? t('login.submitting') : t('login.submit')}
              </Button>
            </form>

            {/* 后端没有「保持登录」能力，这里只给邮件客户端的连接参数提示 */}
            <p className="mt-6 text-center text-[11.5px] leading-relaxed text-fg-subtle">
              {t('login.clientHint', { imap: 'imap', smtp: 'smtp' })}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
