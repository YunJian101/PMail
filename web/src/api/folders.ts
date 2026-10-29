import { get, post } from './client'
import type { FolderItem, GroupModel } from './types'

/** 侧边栏菜单：后端已按 Lang 头本地化好 label，tag 是 SearchTag 的 JSON 字符串 */
export function fetchFolders() {
  return get<FolderItem[]>('/api/group')
}

/** 扁平的分组列表（含收件箱/垃圾/已删除三个默认箱），管理页面用 */
export function fetchFolderList() {
  return get<GroupModel[]>('/api/group/list')
}

export function createFolder(name: string, parentId = 0) {
  return post<number>('/api/group/add', { name, parent_id: parentId })
}

export function deleteFolder(id: number) {
  return post<boolean>('/api/group/del', { id })
}
