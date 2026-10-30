import { get, post } from './client'
import type { UserListResponse, UserModel } from './types'

export interface UserPayload {
  id?: number
  account: string
  /** 后端字段叫 username，对应显示名称 */
  username: string
  password?: string
  disabled: number
  is_admin?: number
}

export function fetchUsers(currentPage = 1, pageSize = 20) {
  return post<UserListResponse>('/api/user/list', {
    current_page: currentPage,
    page_size: pageSize,
  })
}

export function createUser(payload: UserPayload) {
  return post<UserModel>('/api/user/create', payload)
}

export function updateUser(payload: UserPayload) {
  return post<UserModel>('/api/user/edit', payload)
}

/** 插件列表只返回已注册的 hook 名（字符串数组） */
/** 改自己的显示名（后端只认当前登录用户，不接受目标 id） */
export function updateProfile(name: string) {
  return post<{ account: string; name: string }>('/api/user/profile', { name })
}

export function fetchPlugins() {
  return get<string[]>('/api/plugin/list')
}

/** 插件设置页是后端直接吐的 HTML，这里只拼地址，用 iframe 嵌 */
export function pluginSettingsUrl(name: string) {
  return `/api/plugin/settings/${encodeURIComponent(name)}`
}
