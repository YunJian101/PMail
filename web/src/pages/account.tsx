import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IdCard, KeyRound, UserRound } from 'lucide-react'
import { modifyPassword } from '@/api/auth'
import { updateProfile } from '@/api/users'
import { toast, errorText } from '@/lib/toast'
import { useSession } from '@/store/session'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card'

const MIN_PASSWORD_LEN = 8

/**
 * 账户设置：所有登录用户都能用。
 * 只能改自己的显示名与密码 —— 登录名（xxx@域名）由管理员维护，这里只读。
 */
export default function AccountPage() {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)
  const loadSession = useSession((state) => state.load)

  const [name, setName] = React.useState(user?.name ?? '')
  const [oldPassword, setOldPassword] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')

  React.useEffect(() => {
    setName(user?.name ?? '')
  }, [user?.name])

  const nameChanged = name.trim() !== (user?.name ?? '') && name.trim().length > 0

  const profileMutation = useMutation({
    mutationFn: () => updateProfile(name.trim()),
    onSuccess: async () => {
      await loadSession(true)
      toast.success(t('common.saved'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const mismatch = confirm.length > 0 && password !== confirm
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LEN
  const canChangePassword =
    oldPassword.length > 0 && password.length >= MIN_PASSWORD_LEN && password === confirm

  const passwordMutation = useMutation({
    mutationFn: () => modifyPassword(oldPassword, password),
    onSuccess: () => {
      setOldPassword('')
      setPassword('')
      setConfirm('')
      toast.success(t('account.passwordChanged'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  return (
    <div className="h-full overflow-y-auto px-5 py-5 lg:px-7 lg:py-6">
      <PageHeader title={t('account.title')} desc={t('account.desc')} />

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<IdCard className="h-4 w-4" />} title={t('account.identity')} />
          <CardBody className="pt-1">
            <div className="flex items-center gap-2.5">
              <Avatar name={user?.name} email={user?.account} size={38} />
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-[600]">{user?.name || user?.account}</div>
                <div className="truncate font-mono text-[11.5px] text-fg-subtle">{user?.account}</div>
              </div>
              <div className="ml-auto">
                {user?.is_admin ? (
                  <Badge tone="primary">{t('admin.users.roleAdmin')}</Badge>
                ) : (
                  <Badge>{t('admin.users.roleUser')}</Badge>
                )}
              </div>
            </div>

            <dl className="mt-3 space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-subtle">{t('admin.users.colAccount')}</dt>
                <dd className="truncate font-mono text-fg">{user?.account || '—'}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
              {t('account.loginNameHint')}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<UserRound className="h-4 w-4" />} title={t('account.displayName')} />
          <CardBody className="pt-1">
            <Field label={t('admin.users.form.name')} hint={t('account.displayNameHint')}>
              <Input
                value={name}
                maxLength={50}
                onChange={(event) => setName(event.target.value)}
                placeholder={user?.account ?? ''}
              />
            </Field>
            <Button
              variant="primary"
              disabled={!nameChanged || profileMutation.isPending}
              onClick={() => profileMutation.mutate()}
            >
              {profileMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon={<KeyRound className="h-4 w-4" />} title={t('account.changePassword')} />
          <CardBody className="pt-1">
            <div className="grid gap-x-4 lg:grid-cols-3">
              <Field label={t('account.oldPassword')}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                />
              </Field>
              <Field
                label={t('account.newPassword')}
                error={passwordTooShort ? t('account.passwordTooShort', { count: MIN_PASSWORD_LEN }) : undefined}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Field
                label={t('account.confirmPassword')}
                error={mismatch ? t('admin.security.pwdMismatch') : undefined}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </Field>
            </div>
            <Button
              variant="primary"
              disabled={!canChangePassword || passwordMutation.isPending}
              onClick={() => passwordMutation.mutate()}
            >
              {passwordMutation.isPending ? t('common.loading') : t('account.changePassword')}
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
