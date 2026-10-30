import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { modifyPassword } from '@/api/auth'
import { toast, errorText } from '@/lib/toast'
import { useSession } from '@/store/session'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'

export function SecurityPage() {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)

  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')

  // 后端没有密码强度规则，这里只校验非空 + 两次一致
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit = password.length > 0 && password === confirm

  const mutation = useMutation({
    mutationFn: (value: string) => modifyPassword(value),
    onSuccess: () => {
      setPassword('')
      setConfirm('')
      toast.success(t('admin.security.pwdChanged'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  return (
    <div>
      <div className="flex items-end gap-3.5">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-[700] tracking-[-0.02em]">{t('admin.security')}</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">{t('admin.security.desc')}</p>
        </div>
      </div>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-border-base bg-surface shadow-e1">
          <div className="flex items-center gap-2 px-4 pb-3 pt-3.5">
            <KeyRound className="h-4 w-4 text-fg-subtle" />
            <b className="text-[14px] font-[650]">{t('admin.security.modifyPwd')}</b>
          </div>
          <div className="px-4 py-4">
            <p className="mb-4 text-[12.5px] leading-relaxed text-fg-muted">
              {t('admin.security.modifyPwdDesc')}
            </p>
            <Field label={t('admin.security.newPwd')}>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field
              label={t('admin.security.confirmPwd')}
              error={mismatch ? t('admin.security.pwdMismatch') : undefined}
              className="mb-4"
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </Field>
            <Button
              variant="primary"
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate(password)}
            >
              {mutation.isPending ? t('common.loading') : t('admin.security.modifyPwd')}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border-base bg-surface shadow-e1">
          <div className="flex items-center gap-2 px-4 pb-3 pt-3.5">
            <ShieldCheck className="h-4 w-4 text-fg-subtle" />
            <b className="text-[14px] font-[650]">{t('admin.security.session')}</b>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center gap-2.5">
              <Avatar name={user?.name} email={user?.account} size={34} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-[600]">{user?.name || user?.account}</div>
                <div className="truncate font-mono text-[11.5px] text-fg-subtle">{user?.account}</div>
              </div>
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed text-fg-muted">
              {t('admin.security.sessionDesc')}
            </p>

            <dl className="mt-3 space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-subtle">{t('admin.users.colAccount')}</dt>
                <dd className="truncate font-mono text-fg">{user?.account || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-subtle">{t('admin.users.form.name')}</dt>
                <dd className="truncate text-fg">{user?.name || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-subtle">{t('admin.users.colRole')}</dt>
                <dd>
                  {user?.is_admin ? (
                    <Badge tone="primary">{t('admin.users.roleAdmin')}</Badge>
                  ) : (
                    <Badge>{t('admin.users.roleUser')}</Badge>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </div>
  )
}
