import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import i18n from '@/i18n'

/** 后端统一响应信封：{ errorNo, errorMsg, data } */
export interface ApiEnvelope<T> {
  errorNo: number
  errorMsg: string
  data: T
}

export const ERROR_NO = {
  OK: 0,
  PARAMS: 100,
  NEED_SETUP: 402,
  NEED_LOGIN: 403,
  NO_PRIVILEGE: 405,
  SERVER: 500,
} as const

export class ApiError extends Error {
  readonly code: number
  readonly data: unknown
  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.data = data
  }
}

/**
 * 鉴权失败 / 未安装 时由应用层决定往哪跳。
 * 用注册回调的方式避免 client 与 router 互相 import 造成循环依赖。
 */
type RedirectHandler = (kind: 'login' | 'setup') => void
let redirectHandler: RedirectHandler = () => {}
export function setRedirectHandler(handler: RedirectHandler) {
  redirectHandler = handler
}

const http = axios.create({
  // 与后端同源部署；开发态由 vite proxy 转发 /api
  baseURL: '',
  timeout: 60_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json;charset=UTF-8' },
})

http.interceptors.request.use((config) => {
  // 后端只认 "zhCn" / "en"（见 server/i18n/i18n.go）
  config.headers.set('Lang', i18n.language === 'en' ? 'en' : 'zhCn')
  return config
})

http.interceptors.response.use(
  (response) => {
    const envelope = response.data as ApiEnvelope<unknown> | undefined
    if (!envelope || typeof envelope !== 'object' || !('errorNo' in envelope)) {
      // 附件下载等非 JSON 响应直接透传
      return response
    }
    if (envelope.errorNo === ERROR_NO.NEED_LOGIN) {
      redirectHandler('login')
      return Promise.reject(new ApiError(envelope.errorNo, envelope.errorMsg || '请先登录'))
    }
    if (envelope.errorNo === ERROR_NO.NEED_SETUP) {
      redirectHandler('setup')
      return Promise.reject(new ApiError(envelope.errorNo, envelope.errorMsg || '尚未完成安装'))
    }
    return response
  },
  (error: AxiosError) => {
    if (error.response?.status === 403) {
      redirectHandler('login')
    }
    return Promise.reject(error)
  },
)

/** POST 并拆掉信封，失败抛 ApiError */
export async function post<T>(url: string, body: unknown = {}, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.post<ApiEnvelope<T>>(url, body, config)
  const envelope = response.data
  if (envelope.errorNo !== ERROR_NO.OK) {
    throw new ApiError(envelope.errorNo, envelope.errorMsg || i18n.t('common.requestFailed'), envelope.data)
  }
  return envelope.data
}

/** 需要拿原始响应（例如下载流）时用 */
export async function postRaw(url: string, body: unknown = {}, config?: AxiosRequestConfig) {
  return http.post(url, body, config)
}

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.get<ApiEnvelope<T>>(url, config)
  const envelope = response.data
  if (envelope.errorNo !== ERROR_NO.OK) {
    throw new ApiError(envelope.errorNo, envelope.errorMsg || i18n.t('common.requestFailed'), envelope.data)
  }
  return envelope.data
}

export { http }
