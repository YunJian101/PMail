package parsemail

import "strings"

// MailAddress 把账号拼成完整邮箱地址。
//
// 历史数据里 account 有两种形态：纯账号（user）和完整地址（user@example.com，
// 安装向导会把整个邮箱地址写进 account）。这里统一处理，避免拼出 a@b@c 这种地址。
func MailAddress(account, domain string) string {
	account = strings.TrimSpace(account)
	domain = strings.TrimSpace(domain)
	if account == "" {
		return ""
	}
	if strings.Contains(account, "@") {
		return account
	}
	if domain == "" {
		return account
	}
	return account + "@" + domain
}

// LocalAccount 取出账号的本地部分：user@example.com -> user
func LocalAccount(account string) string {
	account = strings.TrimSpace(account)
	if idx := strings.LastIndex(account, "@"); idx > 0 {
		return account[:idx]
	}
	return account
}
