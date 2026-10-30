package setup

import (
	"strings"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/utils/array"
	"github.com/Jinnrry/pmail/utils/errors"
)

// 邮箱域名（@ 后面那段）不应该带这些主机名前缀——它们是系统自己拼的。
// 用户很容易把「SMTP 域名地址」理解成 smtp.example.com 而填错，
// 一填错，DNS 的 MX、发信时的 smtp.<域名>、证书匹配全都会跟着错。
var mailHostPrefixes = []string{"smtp.", "smtps.", "submission.", "imap.", "pop.", "pop3.", "webmail.", "mx."}

// NormalizeMailDomain 把「误填成主机名」的邮箱域名还原成主域名：
// 去掉一层协议/主机前缀（仅当去掉后仍然是合法域名），转小写、去尾点。
func NormalizeMailDomain(raw string) string {
	domain := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(raw), ".")))
	for _, prefix := range mailHostPrefixes {
		if !strings.HasPrefix(domain, prefix) {
			continue
		}
		rest := strings.TrimPrefix(domain, prefix)
		if IsValidHostname(rest) {
			return rest
		}
	}
	return domain
}

// IsValidHostname 做一次宽松但够用的域名校验：
// 至少两级、每级 1~63 个字符、只允许字母数字与连字符、不能以连字符开头结尾。
func IsValidHostname(host string) bool {
	if host == "" || len(host) > 253 {
		return false
	}
	labels := strings.Split(host, ".")
	if len(labels) < 2 {
		return false
	}
	for _, label := range labels {
		if label == "" || len(label) > 63 {
			return false
		}
		if strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return false
		}
		for _, ch := range label {
			isLower := ch >= 'a' && ch <= 'z'
			isDigit := ch >= '0' && ch <= '9'
			if !isLower && !isDigit && ch != '-' {
				return false
			}
		}
	}
	// 顶级域不能是纯数字
	tld := labels[len(labels)-1]
	for _, ch := range tld {
		if ch < 'a' || ch > 'z' {
			return false
		}
	}
	return true
}

func GetDomainSettings() (string, string, []string, error) {
	configData, err := config.ReadConfig()
	if err != nil {
		return "", "", []string{}, errors.Wrap(err)
	}

	return configData.Domain, configData.WebDomain, array.Difference(configData.Domains, []string{configData.Domain}), nil
}

func SetDomainSettings(smtpDomain, webDomain, multiDomains string) error {
	configData, err := config.ReadConfig()
	if err != nil {
		return errors.Wrap(err)
	}

	// 邮箱域名：去掉误填的 smtp./mail./imap. 之类前缀
	smtpDomain = NormalizeMailDomain(smtpDomain)
	// Web 域名保留原样（mail.example.com 是合法的 Web 域名，不能去前缀），只做小写与去尾点
	webDomain = strings.ToLower(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(webDomain), ".")))

	if smtpDomain == "" {
		return errors.New("邮箱域名不能为空")
	}

	if webDomain == "" {
		return errors.New("Web 域名不能为空")
	}

	if !IsValidHostname(smtpDomain) {
		return errors.New("邮箱域名格式不对：" + smtpDomain + "，这里只填主域名，例如 example.com")
	}

	if !IsValidHostname(webDomain) {
		return errors.New("Web 域名格式不对：" + webDomain + "，例如 mail.example.com")
	}

	configData.Domains = []string{}

	if multiDomains != "" {
		for _, item := range strings.Split(multiDomains, ",") {
			domain := NormalizeMailDomain(item)
			if domain == "" || !IsValidHostname(domain) {
				continue
			}
			if !array.InArray(domain, configData.Domains) {
				configData.Domains = append(configData.Domains, domain)
			}
		}
	}

	if !array.InArray(smtpDomain, configData.Domains) {
		configData.Domains = append(configData.Domains, smtpDomain)
	}

	configData.Domain = smtpDomain
	configData.WebDomain = webDomain

	// 检查域名是否指向本机 todo

	err = config.WriteConfig(configData)
	if err != nil {
		return errors.Wrap(err)
	}
	return nil
}
