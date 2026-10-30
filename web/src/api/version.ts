import { get } from '@/api/client'

export interface VersionInfo {
  version: string
  buildTime: string
  gitHash: string
  goVersion: string
}

/** 版本信息不需要登录，安装页也能读 */
export function fetchVersion() {
  return get<VersionInfo>('/api/version')
}
