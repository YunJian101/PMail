import { toast as sonnerToast } from 'sonner'

/**
 * 统一的提示入口。后端返回的错误文案有时是英文 key，这里做一层兜底。
 */
export const toast = {
  success(message: string, description?: string) {
    sonnerToast.success(message, { description })
  },
  error(message: string, description?: string) {
    sonnerToast.error(message, { description })
  },
  info(message: string, description?: string) {
    sonnerToast(message, { description })
  },
  message,
}

function message(text: string) {
  sonnerToast(text)
}

export function errorText(error: unknown, fallback = '操作失败，请稍后重试') {
  if (typeof error === 'string') return error || fallback
  if (error instanceof Error) return error.message || fallback
  if (error && typeof error === 'object') {
    const maybe = error as { message?: unknown; msg?: unknown }
    if (typeof maybe.message === 'string' && maybe.message) return maybe.message
    if (typeof maybe.msg === 'string' && maybe.msg) return maybe.msg
  }
  return fallback
}
