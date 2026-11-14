package auth

import (
	"strings"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/models"
)

// FindUserByAccount 按登录名查用户，兼容两种历史形态：
//
//   - 纯账号：admin
//   - 完整地址：admin@example.com（安装向导会把整个邮箱地址写进 account）
//
// 邮件客户端（POP3/IMAP/SMTP AUTH）习惯用完整地址登录，网页登录可能用纯账号，
// 以前两边只按一种形态精确匹配，导致另一种写法一律"密码错误"。
func FindUserByAccount(input string) (*models.User, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, nil
	}

	candidates := accountCandidates(input)
	lowered := make([]string, 0, len(candidates))
	for _, item := range candidates {
		if item != "" {
			lowered = append(lowered, strings.ToLower(item))
		}
	}
	if len(lowered) == 0 {
		return nil, nil
	}

	var users []*models.User
	if err := db.Instance.Table(&models.User{}).
		Where("LOWER(account) IN ("+placeholders(len(lowered))+")", toAny(lowered)...).
		Find(&users); err != nil {
		return nil, err
	}
	if len(users) == 0 {
		return nil, nil
	}

	// 优先返回与输入完全一致的那条（大小写敏感匹配），否则返回第一条
	for _, user := range users {
		if user.Account == input {
			return user, nil
		}
	}
	return users[0], nil
}

// accountCandidates 生成可能的账号写法：原样、本地部分、本地部分+各本域
func accountCandidates(input string) []string {
	out := []string{input}
	if idx := strings.LastIndex(input, "@"); idx > 0 {
		// 完整地址 → 再试本地部分
		out = append(out, input[:idx])
		return out
	}

	// 纯账号 → 再试加上本域
	domains := append([]string{}, config.Instance.Domains...)
	if config.Instance.Domain != "" {
		domains = append(domains, config.Instance.Domain)
	}
	seen := map[string]bool{strings.ToLower(input): true}
	for _, domain := range domains {
		domain = strings.TrimSpace(domain)
		if domain == "" {
			continue
		}
		candidate := input + "@" + domain
		if seen[strings.ToLower(candidate)] {
			continue
		}
		seen[strings.ToLower(candidate)] = true
		out = append(out, candidate)
	}
	return out
}

func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

func toAny(values []string) []any {
	ret := make([]any, 0, len(values))
	for _, value := range values {
		ret = append(ret, value)
	}
	return ret
}
