import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Users,
} from 'lucide-react'
import { createUser, fetchUsers, updateUser } from '@/api/users'
import type { UserPayload } from '@/api/users'
import type { UserModel } from '@/api/types'
import { cn } from '@/lib/utils'
import { toast, errorText } from '@/lib/toast'
import { useSession } from '@/store/session'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card'

/** 后端 /api/user/list 的默认分页是 15，这里显式传，避免 offset 计算踩到 page_size=0 的坑 */
const PAGE_SIZE = 10

type FormState = {
  /** @ 之前的部分，编辑时不可改（后端 EditUser 不更新 account） */
  account: string
  domain: string
  name: string
  password: string
  isAdmin: boolean
  disabled: boolean
}

const EMPTY_FORM: FormState = {
  account: '',
  domain: '',
  name: '',
  password: '',
  isAdmin: false,
  disabled: false,
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <Card>
      <CardBody className="py-3.5">
        <div className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
          {icon}
          {label}
        </div>
        <div className="mt-1.5 text-[23px] font-[700] leading-none tracking-[-0.02em] tabular-nums">
          {value}
        </div>
        {hint ? <div className="mt-1.5 text-[11.5px] text-fg-subtle">{hint}</div> : null}
      </CardBody>
    </Card>
  )
}

export function UsersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const sessionUser = useSession((state) => state.user)
  const domains = sessionUser?.domains ?? []

  const [page, setPage] = React.useState(1)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<UserModel | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [resetTarget, setResetTarget] = React.useState<UserModel | null>(null)
  const [resetPassword, setResetPassword] = React.useState('')

  const listQuery = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () => fetchUsers(page, PAGE_SIZE),
    placeholderData: (previous) => previous,
  })

  const users = listQuery.data?.list ?? []
  const totalPage = Math.max(1, listQuery.data?.total_page ?? 1)
  const currentPage = listQuery.data?.current_page || page

  // 后端没有统计接口，这里只统计当前页里能确定的事实
  const adminCount = users.filter((item) => item.IsAdmin === 1).length
  const disabledCount = users.filter((item) => item.Disabled === 1).length
  const activeCount = users.length - disabledCount

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })

  const saveMutation = useMutation({
    mutationFn: (payload: UserPayload) =>
      payload.id ? updateUser(payload) : createUser(payload),
    onSuccess: () => {
      setDialogOpen(false)
      void invalidate()
      toast.success(t('common.saved'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  // 后端没有删除用户接口，用 EditUser 的 disabled 字段实现停用 / 启用
  const toggleMutation = useMutation({
    mutationFn: (user: UserModel) =>
      updateUser({
        id: user.ID,
        account: user.Account,
        username: user.Name,
        disabled: user.Disabled === 1 ? 0 : 1,
      }),
    onSuccess: () => {
      void invalidate()
      toast.success(t('common.saved'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const resetMutation = useMutation({
    mutationFn: ({ user, password }: { user: UserModel; password: string }) =>
      updateUser({
        id: user.ID,
        account: user.Account,
        username: user.Name,
        password,
        disabled: user.Disabled,
      }),
    onSuccess: () => {
      setResetTarget(null)
      setResetPassword('')
      toast.success(t('admin.users.resetPwdDone'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, domain: domains[0] ?? '' })
    setDialogOpen(true)
  }

  const openEdit = (user: UserModel) => {
    const at = user.Account.indexOf('@')
    setEditing(user)
    setForm({
      account: at >= 0 ? user.Account.slice(0, at) : user.Account,
      domain: at >= 0 ? user.Account.slice(at + 1) : (domains[0] ?? ''),
      name: user.Name,
      password: '',
      isAdmin: user.IsAdmin === 1,
      disabled: user.Disabled === 1,
    })
    setDialogOpen(true)
  }

  const canSubmit = editing
    ? form.name.trim().length > 0
    : Boolean(form.account.trim() && form.domain && form.name.trim() && form.password)

  const submit = () => {
    if (!canSubmit) return
    if (editing) {
      // EditUser 在「一个字段都没变」时会走到 num==0 分支返回 No Data Update，这里直接收工
      const unchanged =
        form.name.trim() === editing.Name &&
        form.disabled === (editing.Disabled === 1) &&
        !form.password
      if (unchanged) {
        setDialogOpen(false)
        toast.success(t('common.saved'))
        return
      }
    }
    const account = editing ? editing.Account : `${form.account.trim()}@${form.domain}`
    const payload: UserPayload = {
      id: editing?.ID,
      account,
      username: form.name.trim(),
      disabled: form.disabled ? 1 : 0,
      is_admin: form.isAdmin ? 1 : 0,
    }
    if (form.password) payload.password = form.password
    saveMutation.mutate(payload)
  }

  return (
    <div>
      <PageHeader
        title={t('admin.users')}
        desc={t('admin.users.desc')}
        actions={
          <>
            <Tooltip label={t('common.refresh')}>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => void listQuery.refetch()}
                disabled={listQuery.isFetching}
                aria-label={t('common.refresh')}
              >
                <RefreshCw className={cn('h-4 w-4', listQuery.isFetching && 'animate-spin')} />
              </Button>
            </Tooltip>
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t('admin.users.new')}
            </Button>
          </>
        }
      />

      <div className="mt-5 grid grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="h-3.5 w-3.5" />}
          label={t('admin.users.total')}
          value={users.length}
          hint={t('mail.pagination', { page: currentPage, total: totalPage })}
        />
        <StatCard
          icon={<Shield className="h-3.5 w-3.5" />}
          label={t('admin.users.roleAdmin')}
          value={adminCount}
        />
        <StatCard
          icon={<Ban className="h-3.5 w-3.5" />}
          label={t('admin.users.statusDisabled')}
          value={disabledCount}
        />
        <StatCard
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label={t('common.enabled')}
          value={activeCount}
        />
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader
          title={t('admin.users.list')}
          actions={
            <span className="text-[12px] tabular-nums text-fg-subtle">
              {t('mail.pagination', { page: currentPage, total: totalPage })}
            </span>
          }
        />

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-2">
              <th className="px-4 py-2.5 text-left text-[11.5px] font-[650] uppercase tracking-[0.04em] text-fg-subtle">
                {t('admin.users.colAccount')}
              </th>
              <th className="px-4 py-2.5 text-left text-[11.5px] font-[650] uppercase tracking-[0.04em] text-fg-subtle">
                {t('admin.users.colRole')}
              </th>
              <th className="px-4 py-2.5 text-left text-[11.5px] font-[650] uppercase tracking-[0.04em] text-fg-subtle">
                {t('admin.users.colStatus')}
              </th>
              <th className="px-4 py-2.5 text-right text-[11.5px] font-[650] uppercase tracking-[0.04em] text-fg-subtle">
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading
              ? Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index} className="border-t border-border-base/70">
                    <td className="px-4 py-3" colSpan={4}>
                      <Skeleton className="h-7 w-full" />
                    </td>
                  </tr>
                ))
              : null}

            {!listQuery.isLoading && users.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={<Users className="h-5 w-5" />}
                    title={t('common.empty')}
                    description={t('admin.users.desc')}
                  />
                </td>
              </tr>
            ) : null}

            {!listQuery.isLoading
              ? users.map((user) => (
                  <tr
                    key={user.ID}
                    className="border-t border-border-base/70 transition-colors hover:bg-surface-3"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={user.Name} email={user.Account} size={30} />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-[600]">
                            {user.Name || user.Account}
                          </div>
                          <div className="truncate font-mono text-[11.5px] text-fg-subtle">
                            {user.Account}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.IsAdmin === 1 ? (
                        <Badge tone="primary">{t('admin.users.roleAdmin')}</Badge>
                      ) : (
                        <Badge>{t('admin.users.roleUser')}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.Disabled === 1 ? (
                        <Badge tone="warning">{t('admin.users.statusDisabled')}</Badge>
                      ) : (
                        <Badge tone="success">{t('admin.users.statusActive')}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label={t('common.edit')}>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(user)}
                            aria-label={t('common.edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                        <Tooltip label={t('admin.users.resetPwd')}>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setResetTarget(user)
                              setResetPassword('')
                            }}
                            aria-label={t('admin.users.resetPwd')}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                        <Tooltip label={user.Disabled === 1 ? t('common.enable') : t('common.disable')}>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className={user.Disabled === 1 ? 'text-success' : 'text-fg-muted'}
                            onClick={() => toggleMutation.mutate(user)}
                            disabled={toggleMutation.isPending}
                            aria-label={user.Disabled === 1 ? t('common.enable') : t('common.disable')}
                          >
                            {user.Disabled === 1 ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>

        <div className="flex h-11 items-center justify-between border-t border-border-base/70 px-4 text-[12px] text-fg-subtle">
          <span className="tabular-nums">
            {t('mail.pagination', { page: currentPage, total: totalPage })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              aria-label={t('mail.pagination.prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={currentPage >= totalPage}
              onClick={() => setPage((prev) => Math.min(totalPage, prev + 1))}
              aria-label={t('mail.pagination.next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ---------------- 新建 / 编辑 ---------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader
            title={editing ? t('admin.users.edit') : t('admin.users.new')}
            description={t('admin.users.desc')}
          />
          <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
            {editing ? (
              <Field label={t('admin.users.colAccount')}>
                <Input value={editing.Account} disabled readOnly />
              </Field>
            ) : (
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                <Field
                  label={t('admin.users.form.account')}
                  hint={t('admin.users.form.accountHint')}
                  className="mb-4"
                >
                  <Input
                    value={form.account}
                    autoFocus
                    onChange={(event) => setForm({ ...form, account: event.target.value })}
                    placeholder="name"
                  />
                </Field>
                <span className="pt-[34px] text-[13px] text-fg-subtle">@</span>
                <Field label={t('admin.users.form.domain')} className="mb-4">
                  <Select
                    value={form.domain}
                    onChange={(event) => setForm({ ...form, domain: event.target.value })}
                  >
                    {domains.length === 0 ? <option value="">—</option> : null}
                    {domains.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            <Field label={t('admin.users.form.name')}>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>

            <Field
              label={t('admin.users.form.password')}
              hint={editing ? t('admin.users.form.passwordHint') : undefined}
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </Field>

            {/* 后端 user/create|edit 不接收 is_admin，这里不做开关，避免给出一个存不进去的控件 */}
            <div className="flex items-start gap-2 rounded-sm border border-border-base bg-surface-2 px-3 py-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-none text-fg-subtle" />
              <span className="text-[12px] leading-relaxed text-fg-subtle">
                {t('admin.users.form.isAdminUnsupported')}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between rounded-sm border border-border-base px-3 py-2.5">
              <span className="text-[13px] font-[550] text-fg">
                {t('admin.users.form.disabled')}
              </span>
              <Switch
                checked={form.disabled}
                onCheckedChange={(checked) => setForm({ ...form, disabled: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={!canSubmit || saveMutation.isPending}
            >
              {saveMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- 重置密码 ---------------- */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null)
            setResetPassword('')
          }
        }}
      >
        <DialogContent width="max-w-sm">
          <DialogHeader
            title={t('admin.users.resetPwd')}
            description={resetTarget?.Account ?? undefined}
          />
          <div className="px-5 py-4">
            <Field label={t('admin.users.form.password')} className="mb-0">
              <Input
                type="password"
                autoComplete="new-password"
                autoFocus
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!resetPassword || resetMutation.isPending}
              onClick={() => {
                if (!resetTarget || !resetPassword) return
                resetMutation.mutate({ user: resetTarget, password: resetPassword })
              }}
            >
              {resetMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
