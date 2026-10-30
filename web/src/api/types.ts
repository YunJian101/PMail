/**
 * 与 Go 后端一一对应的数据结构。
 * 字段名严格按后端 json tag 写，不要改成驼峰 —— 这些结构是直接透传的。
 */

/** dto.SearchTag：type -1 不限 / 0 收件 / 1 发件；status -1 不限 / 3 删除 / 4 草稿 / 5 垃圾 */
export interface SearchTag {
  type: number
  status: number
  group_id: number
}

/** GET /api/group 返回的菜单项，tag 是 SearchTag 的 JSON 字符串 */
export interface FolderItem {
  label: string
  tag: string
  children?: FolderItem[]
}

/** 后端 models.Group（扁平列表用） */
export interface GroupModel {
  id: number
  name: string
  parent_id: number
  full_path: string
}

/** 列表项里的人员结构，后端用了大写 json tag */
export interface MailUser {
  Name: string
  EmailAddress: string
}

export interface MailListItem {
  id: number
  title: string
  desc: string
  datetime: string
  is_read: boolean
  sender: MailUser
  to: MailUser[]
  dangerous: boolean
  error: string
}

export interface MailListResponse {
  current_page: number
  total_page: number
  list: MailListItem[]
}

/** models.Email 的 MarshalJSON 输出 */
export interface MailAttachmentMeta {
  Filename: string
  ContentType: string
  Index: number
}

export interface MailDetail {
  id: number
  type: number
  is_read?: boolean
  subject: string
  reply_to: string
  from_name: string
  from_address: string
  to: string
  bcc: string
  cc: string
  text: string
  html: string
  sender: string
  attachments: MailAttachmentMeta[]
  spf_check: number
  dkim_check: number
  /** 0 未发送 1 已发送 2 发送失败 3 删除 4 草稿 5 垃圾 6 投递中 */
  status: number
  send_time: string
  send_date: string
  update_time: string
  create_time: string
  send_user_id: number
  size: number
  error: string
  msg_id: string
}

/** models.User：没有 json tag 的字段就是 Go 字段名 */
export interface UserModel {
  ID: number
  Account: string
  Name: string
  Disabled: number
  IsAdmin: number
}

export interface UserListResponse {
  current_page: number
  total_page: number
  list: UserModel[]
}

export interface SessionUser {
  account: string
  name: string
  is_admin: boolean
  domains: string[]
}

export interface SendMailUser {
  name: string
  email: string
}

export interface SendMailAttachment {
  name: string
  /** 形如 data:image/png;base64,xxxx */
  data: string
}

export interface SendMailPayload {
  reply_to?: SendMailUser[]
  from: SendMailUser
  to: SendMailUser[]
  cc?: SendMailUser[]
  bcc?: SendMailUser[]
  subject: string
  text?: string
  html?: string
  sender?: SendMailUser
  read_receipt?: string[]
  attrs?: SendMailAttachment[]
}

/** 规则条件：field 只能是 From / Subject / To / Cc / Text / Html / Content */
export interface RuleCondition {
  field: 'From' | 'Subject' | 'To' | 'Cc' | 'Text' | 'Html' | 'Content'
  /** 匹配方式：equal / contains / regex */
  type: string
  rule: string
}

/** 动作码：1 标记已读 2 转发 3 删除 4 移动到分组 */
export const RULE_ACTION = {
  READ: 1,
  FORWARD: 2,
  DELETE: 3,
  MOVE: 4,
} as const

/** 后端 dto.Rule（/api/rule/get 返回数组，/api/rule/add|update 用它做入参） */
export interface RuleItem {
  id: number
  user_id: number
  name: string
  rules: RuleCondition[]
  action: number
  params: string
  sort: number
}
