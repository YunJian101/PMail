import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Filter, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { deleteRule, fetchRules, saveRule } from '@/api/rules'
import { fetchFolderList } from '@/api/folders'
import { RULE_ACTION } from '@/api/types'
import type { RuleCondition, RuleItem } from '@/api/types'
import { cn } from '@/lib/utils'
import { toast, errorText } from '@/lib/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'

/** 后端只接受这 7 个 field 值（见 controllers/rule.go 的白名单校验） */
const FIELD_OPTIONS: RuleCondition['field'][] = [
  'From',
  'Subject',
  'To',
  'Cc',
  'Text',
  'Html',
  'Content',
]

const MATCH_OPTIONS = ['equal', 'contains', 'regex'] as const

const ACTION_OPTIONS = [RULE_ACTION.READ, RULE_ACTION.FORWARD, RULE_ACTION.DELETE, RULE_ACTION.MOVE]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type RuleForm = {
  id: number
  name: string
  /** 数字输入框用 string 绑定，保存时再转 */
  sort: string
  action: number
  params: string
  conditions: RuleCondition[]
}

const EMPTY_FORM: RuleForm = {
  id: 0,
  name: '',
  sort: '0',
  action: RULE_ACTION.READ,
  params: '',
  conditions: [{ field: 'From', type: 'contains', rule: '' }],
}

export function RulesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<RuleForm>(EMPTY_FORM)
  const [pending, setPending] = React.useState<RuleItem | null>(null)

  const rulesQuery = useQuery({ queryKey: ['admin-rules'], queryFn: fetchRules })
  const foldersQuery = useQuery({ queryKey: ['admin-folders'], queryFn: fetchFolderList })

  const rules = rulesQuery.data ?? []
  const folders = foldersQuery.data ?? []

  const fieldLabel = (field: RuleCondition['field']) => {
    if (field === 'From') return t('admin.rules.field.from')
    if (field === 'Subject') return t('admin.rules.field.subject')
    if (field === 'Content') return t('admin.rules.field.content')
    return field
  }

  const matchLabel = (type: string) => {
    if (type === 'equal') return t('admin.rules.match.equal')
    if (type === 'contains') return t('admin.rules.match.contains')
    if (type === 'regex') return t('admin.rules.match.regex')
    return type
  }

  const actionLabel = (action: number) => {
    switch (action) {
      case RULE_ACTION.READ:
        return t('admin.rules.action.markRead')
      case RULE_ACTION.FORWARD:
        return t('admin.rules.action.forward')
      case RULE_ACTION.DELETE:
        return t('admin.rules.action.delete')
      case RULE_ACTION.MOVE:
        return t('admin.rules.action.move')
      default:
        return String(action)
    }
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-rules'] })

  const saveMutation = useMutation({
    mutationFn: (rule: RuleItem) => saveRule(rule),
    onSuccess: () => {
      setDialogOpen(false)
      void invalidate()
      toast.success(t('common.saved'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRule(id),
    onSuccess: () => {
      setPending(null)
      void invalidate()
      toast.success(t('common.deleted'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, conditions: [{ field: 'From', type: 'contains', rule: '' }] })
    setDialogOpen(true)
  }

  const openEdit = (rule: RuleItem) => {
    setForm({
      id: rule.id,
      name: rule.name ?? '',
      sort: String(rule.sort ?? 0),
      action: rule.action,
      params: rule.params ?? '',
      conditions: (rule.rules ?? []).map((condition) => ({ ...condition })),
    })
    setDialogOpen(true)
  }

  const updateCondition = (index: number, patch: Partial<RuleCondition>) => {
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }))
  }

  const addCondition = () => {
    setForm((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { field: 'From', type: 'contains', rule: '' }],
    }))
  }

  const removeCondition = (index: number) => {
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }))
  }

  const needsParams = form.action === RULE_ACTION.FORWARD || form.action === RULE_ACTION.MOVE
  const forwardEmailInvalid =
    form.action === RULE_ACTION.FORWARD && form.params.trim() !== '' && !EMAIL_RE.test(form.params.trim())
  const paramsValid =
    form.action === RULE_ACTION.FORWARD
      ? EMAIL_RE.test(form.params.trim())
      : form.action === RULE_ACTION.MOVE
        ? form.params.trim() !== ''
        : true
  const conditionsValid = form.conditions.every((condition) => condition.rule.trim().length > 0)
  const canSave = form.name.trim().length > 0 && conditionsValid && paramsValid

  const submit = () => {
    if (!canSave) return
    saveMutation.mutate({
      id: form.id,
      // 后端忽略这个字段，真实 user_id 取自登录态
      user_id: 0,
      name: form.name.trim(),
      rules: form.conditions.map((condition) => ({ ...condition, rule: condition.rule.trim() })),
      action: form.action,
      params: needsParams ? form.params.trim() : '',
      sort: Number(form.sort) || 0,
    })
  }

  return (
    <div>
      <div className="flex items-end gap-3.5">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-[700] tracking-[-0.02em]">{t('admin.rules')}</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">{t('admin.rules.desc')}</p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          <Tooltip label={t('common.refresh')}>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => void rulesQuery.refetch()}
              disabled={rulesQuery.isFetching}
              aria-label={t('common.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', rulesQuery.isFetching && 'animate-spin')} />
            </Button>
          </Tooltip>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t('admin.rules.new')}
          </Button>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border-base bg-surface shadow-e1">
        <div className="flex items-center gap-2 border-b border-border-base px-4 py-3">
          <b className="text-[14px] font-[650]">{t('admin.rules')}</b>
          <span className="text-[12px] tabular-nums text-fg-subtle">{rules.length}</span>
        </div>

        {rulesQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={<Filter className="h-5 w-5" />}
            title={t('admin.rules.empty')}
            description={t('admin.rules.desc')}
            action={
              <Button variant="primary" size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                {t('admin.rules.new')}
              </Button>
            }
          />
        ) : (
          rules.map((rule) => {
            const conditions = rule.rules ?? []
            return (
              <div
                key={rule.id}
                className="flex items-start gap-3 border-t border-border-base px-4 py-3.5 transition-colors hover:bg-surface-2"
              >
                <Tooltip label={t('admin.rules.priority')}>
                  <div className="mt-0.5 grid h-[22px] min-w-[22px] flex-none place-items-center rounded-md bg-surface-3 px-1 text-[11px] font-[700] tabular-nums text-fg-subtle">
                    {rule.sort}
                  </div>
                </Tooltip>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-[600] text-fg">
                      {rule.name || t('admin.rules.name')}
                    </span>
                    <Badge tone="primary">{actionLabel(rule.action)}</Badge>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {conditions.length === 0 ? (
                      <span className="text-[12px] text-fg-subtle">{t('common.empty')}</span>
                    ) : (
                      conditions.map((condition, index) => (
                        <span
                          key={`${rule.id}-${index}`}
                          className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[11.5px] text-fg-muted"
                        >
                          {fieldLabel(condition.field)}
                          {matchLabel(condition.type)}
                          <span className="font-mono text-fg">{condition.rule}</span>
                        </span>
                      ))
                    )}
                  </div>

                  {rule.params ? (
                    <div className="mt-1 truncate font-mono text-[11.5px] text-fg-subtle">
                      {rule.params}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-none items-center gap-1">
                  <Tooltip label={t('common.edit')}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(rule)}
                      aria-label={t('common.edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                  <Tooltip label={t('common.delete')}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-danger"
                      onClick={() => setPending(rule)}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ---------------- 新建 / 编辑 ---------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader
            title={form.id > 0 ? t('common.edit') : t('admin.rules.new')}
            description={t('admin.rules.desc')}
          />
          <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <Field label={t('admin.rules.name')}>
                <Input
                  value={form.name}
                  autoFocus
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label={t('admin.rules.priority')}>
                <Input
                  type="number"
                  value={form.sort}
                  onChange={(event) => setForm({ ...form, sort: event.target.value })}
                />
              </Field>
            </div>

            <div className="mb-1.5 text-[12.5px] font-[600] text-fg-muted">{t('admin.rules.when')}</div>
            <div className="space-y-2">
              {form.conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    className="w-[126px] flex-none"
                    value={condition.field}
                    onChange={(event) =>
                      updateCondition(index, {
                        field: event.target.value as RuleCondition['field'],
                      })
                    }
                  >
                    {FIELD_OPTIONS.map((field) => (
                      <option key={field} value={field}>
                        {fieldLabel(field)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="w-[104px] flex-none"
                    value={condition.type}
                    onChange={(event) => updateCondition(index, { type: event.target.value })}
                  >
                    {MATCH_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {matchLabel(type)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    className="min-w-0 flex-1"
                    value={condition.rule}
                    onChange={(event) => updateCondition(index, { rule: event.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeCondition(index)}
                    aria-label={t('common.delete')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={addCondition}>
              <Plus className="h-4 w-4" />
              {t('admin.rules.addCondition')}
            </Button>

            <div className="mt-3 border-t border-border-base pt-4">
              <div className="mb-1.5 text-[12.5px] font-[600] text-fg-muted">{t('admin.rules.then')}</div>
              <Field label={t('common.actions')} className="mb-2">
                <Select
                  value={String(form.action)}
                  onChange={(event) => setForm({ ...form, action: Number(event.target.value) })}
                >
                  {ACTION_OPTIONS.map((action) => (
                    <option key={action} value={String(action)}>
                      {actionLabel(action)}
                    </option>
                  ))}
                </Select>
              </Field>

              {form.action === RULE_ACTION.FORWARD ? (
                <Field
                  label={t('admin.rules.params')}
                  hint={t('admin.rules.action.forward')}
                  error={
                    forwardEmailInvalid
                      ? t('compose.errBadEmail', { email: form.params })
                      : undefined
                  }
                  className="mb-0"
                >
                  <Input
                    value={form.params}
                    placeholder={t('login.accountPlaceholder')}
                    onChange={(event) => setForm({ ...form, params: event.target.value })}
                  />
                </Field>
              ) : null}

              {form.action === RULE_ACTION.MOVE ? (
                <Field label={t('admin.rules.params')} className="mb-0">
                  <Select
                    value={form.params}
                    onChange={(event) => setForm({ ...form, params: event.target.value })}
                  >
                    <option value="">—</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={String(folder.id)}>
                        {folder.full_path && folder.full_path !== '/'
                          ? folder.full_path
                          : folder.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!canSave || saveMutation.isPending}
              onClick={submit}
            >
              {saveMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- 删除确认 ---------------- */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <DialogContent width="max-w-sm">
          <DialogHeader title={t('common.delete')} description={t('admin.rules.deleteConfirm')} />
          <DialogFooter className="mt-1">
            <Button variant="secondary" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (pending) deleteMutation.mutate(pending.id)
              }}
            >
              {deleteMutation.isPending ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
