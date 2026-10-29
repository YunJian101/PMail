import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Folder, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { createFolder, deleteFolder, fetchFolderList } from '@/api/folders'
import type { GroupModel } from '@/api/types'
import { GROUP_CONST } from '@/lib/folders'
import { cn } from '@/lib/utils'
import { toast, errorText } from '@/lib/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'

/** /api/group/list 会先把收件箱 / 垃圾 / 已删除三个内置箱塞进来，它们的 id 是 2000000000 起的常量 */
function isBuiltIn(group: GroupModel) {
  return group.id >= GROUP_CONST.INBOX
}

export function FoldersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [parentId, setParentId] = React.useState('0')
  const [pending, setPending] = React.useState<GroupModel | null>(null)

  const listQuery = useQuery({ queryKey: ['admin-folders'], queryFn: fetchFolderList })
  const groups = listQuery.data ?? []
  const customGroups = groups.filter((group) => !isBuiltIn(group))

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-folders'] })
    // 侧边栏菜单是另一份数据（/api/group），一起刷新
    void queryClient.invalidateQueries({ queryKey: ['folders'] })
  }

  const createMutation = useMutation({
    mutationFn: () => createFolder(name.trim(), Number(parentId) || 0),
    onSuccess: () => {
      setCreateOpen(false)
      setName('')
      setParentId('0')
      invalidate()
      toast.success(t('common.saved'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFolder(id),
    onSuccess: () => {
      setPending(null)
      invalidate()
      toast.success(t('common.deleted'))
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const parentLabel = (group: GroupModel) => {
    if (!group.parent_id) return t('admin.groups.root')
    const parent = groups.find((item) => item.id === group.parent_id)
    return parent?.name ?? String(group.parent_id)
  }

  return (
    <div>
      <div className="flex items-end gap-3.5">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-[700] tracking-[-0.02em]">{t('admin.groups')}</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">{t('admin.groups.desc')}</p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
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
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('admin.groups.new')}
          </Button>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border-base bg-surface shadow-e1">
        <div className="flex items-center gap-2 border-b border-border-base px-4 py-3">
          <b className="text-[14px] font-[650]">{t('admin.groups')}</b>
          <span className="text-[12px] tabular-nums text-fg-subtle">
            {customGroups.length}
          </span>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-2">
              <th className="px-4 py-2.5 text-left text-[11.5px] font-[650] uppercase tracking-[0.04em] text-fg-subtle">
                {t('admin.groups.name')}
              </th>
              <th className="px-4 py-2.5 text-left text-[11.5px] font-[650] uppercase tracking-[0.04em] text-fg-subtle">
                {t('admin.groups.parent')}
              </th>
              <th className="px-4 py-2.5 text-left text-[11.5px] font-[650] uppercase tracking-[0.04em] text-fg-subtle">
                {t('common.type')}
              </th>
              <th className="px-4 py-2.5 text-right text-[11.5px] font-[650] uppercase tracking-[0.04em] text-fg-subtle">
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <tr key={index} className="border-t border-border-base">
                    <td className="px-4 py-3" colSpan={4}>
                      <Skeleton className="h-7 w-full" />
                    </td>
                  </tr>
                ))
              : null}

            {!listQuery.isLoading && groups.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={<Folder className="h-5 w-5" />}
                    title={t('admin.groups.empty')}
                    description={t('admin.groups.desc')}
                  />
                </td>
              </tr>
            ) : null}

            {!listQuery.isLoading
              ? groups.map((group) => {
                  const builtIn = isBuiltIn(group)
                  return (
                    <tr
                      key={group.id}
                      className="border-t border-border-base transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-md bg-surface-3 text-fg-subtle">
                            <Folder className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-[600]">{group.name}</div>
                            <div className="truncate font-mono text-[11.5px] text-fg-subtle">
                              {group.full_path && group.full_path !== '/'
                                ? group.full_path
                                : t('admin.groups.root')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-fg-muted">
                        {builtIn ? t('admin.groups.root') : parentLabel(group)}
                      </td>
                      <td className="px-4 py-3">
                        {builtIn ? (
                          <Badge>{t('admin.users.roleSystem')}</Badge>
                        ) : (
                          <Badge tone="primary">{t('folder.custom')}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {builtIn ? null : (
                            <Tooltip label={t('common.delete')}>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-danger"
                                onClick={() => setPending(group)}
                                aria-label={t('common.delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              : null}
          </tbody>
        </table>
      </div>

      {/* ---------------- 新建分组 ---------------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent width="max-w-md">
          <DialogHeader title={t('admin.groups.new')} description={t('admin.groups.desc')} />
          <div className="px-5 py-4">
            <Field label={t('admin.groups.name')}>
              <Input
                value={name}
                autoFocus
                placeholder={t('folder.namePlaceholder')}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label={t('admin.groups.parent')} className="mb-0">
              <Select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="0">{t('admin.groups.root')}</option>
                {customGroups.map((group) => (
                  <option key={group.id} value={String(group.id)}>
                    {group.full_path && group.full_path !== '/'
                      ? group.full_path
                      : group.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? t('common.loading') : t('common.save')}
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
          <DialogHeader
            title={t('common.delete')}
            description={t('admin.groups.deleteConfirm', { name: pending?.name ?? '' })}
          />
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
