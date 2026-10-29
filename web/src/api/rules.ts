import { get, post } from './client'
import type { RuleItem } from './types'

export function fetchRules() {
  return get<RuleItem[]>('/api/rule/get')
}

/** id > 0 时后端走更新，否则插入（add 与 update 是同一个 handler） */
export function saveRule(rule: RuleItem) {
  return post<string>('/api/rule/add', rule)
}

export function deleteRule(id: number) {
  return post<string>('/api/rule/del', { id })
}
