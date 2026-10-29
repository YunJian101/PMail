import { post, http } from './client'
import type {
  MailDetail,
  MailListResponse,
  SearchTag,
  SendMailPayload,
} from './types'

/** 列表请求：tag 必须是「SearchTag 的 JSON 字符串」，后端会再 unmarshal 一次 */
export interface ListMailParams {
  keyword?: string
  tag: SearchTag
  current_page?: number
  page_size?: number
}

export function listMail(params: ListMailParams) {
  return post<MailListResponse>('/api/email/list', {
    keyword: params.keyword ?? '',
    tag: JSON.stringify(params.tag),
    current_page: params.current_page ?? 1,
    page_size: params.page_size ?? 20,
  })
}

export function getMailDetail(id: number) {
  return post<MailDetail>('/api/email/detail', { id })
}

export function markMailRead(ids: number[]) {
  return post<string>('/api/email/read', { ids })
}

/**
 * 删除邮件。
 * forcedDel=true 是彻底删除，false 只是移到已删除。
 */
export function deleteMail(ids: number[], forcedDel = false) {
  return post<string>('/api/email/del', { ids, forcedDel })
}

/** 移动到分组：group_id 可以是自定义分组 id，也可以是后端约定的默认箱常量 */
export function moveMail(ids: number[], groupId: number) {
  return post<string>('/api/email/move', { ids, group_id: groupId })
}

export function sendMail(payload: SendMailPayload) {
  return post<string>('/api/email/send', payload)
}

/** 正文内联图片（cid） */
export function attachmentInlineUrl(emailId: number, cid: string) {
  return `/attachments/${emailId}/${encodeURIComponent(cid)}`
}

/** 按附件序号下载 */
export function attachmentDownloadUrl(emailId: number, index: number) {
  return `/attachments/download/${emailId}/${index}`
}

/** 触发浏览器下载（带 cookie，所以走 a 标签而不是 fetch） */
export function triggerDownload(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** 把任意文件读成 data URL，发信接口要求这种格式 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export { http }
