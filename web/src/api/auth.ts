import { get, post } from './client'
import type { SessionUser } from './types'

export function login(account: string, password: string) {
  return post<SessionUser>('/api/login', { account, password })
}

export function logout() {
  // 该接口不读 body，GET 即可
  return get<string>('/api/logout')
}

export function fetchSession() {
  return get<SessionUser>('/api/user/info')
}

export function modifyPassword(password: string) {
  return post<string>('/api/settings/modify_password', { password })
}
