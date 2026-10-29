package setup

import (
	"fmt"
	"os"
	"strings"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/i18n"
	"github.com/Jinnrry/pmail/services/auth"
	"github.com/Jinnrry/pmail/utils/context"
	"github.com/Jinnrry/pmail/utils/errors"
)

// placeholderIP 是 A 记录值的占位符：让用户填自己的公网 IP。
//
// 这里刻意不再调用 ip.GetIp() 去外网查公网 IP：
//   - 这一步的产物就是让用户手动抄进 DNS 面板，查出来也一样要手填
//   - 那个接口没有超时，国内经常连不上，会把整个向导卡死（历史上就是它在挂）
//   - 每条 A 记录各调一次、失败还不缓存，等于连续死等 5 次
//
// 想让它自动填，就在 config.json 里加 publicIP 字段，完全不联网。
const placeholderIP = "[Your Server IP]"

type DNSItem struct {
	Type  string `json:"type"`
	Host  string `json:"host"`
	Value string `json:"value"`
	TTL   int    `json:"ttl"`
	Tips  string `json:"tips"`
}

func GetDNSSettings(ctx *context.Context) (map[string][]*DNSItem, error) {
	configData, err := config.ReadConfig()
	if err != nil {
		return nil, errors.Wrap(err)
	}

	// 显式给了公网 IP 就直接用（环境变量 PMAIL_PUBLIC_IP），否则留占位符让用户填
	ipValue := placeholderIP
	if publicIP := strings.TrimSpace(os.Getenv("PMAIL_PUBLIC_IP")); publicIP != "" {
		ipValue = publicIP
	}

	ret := make(map[string][]*DNSItem)

	for _, domain := range configData.Domains {
		ret[domain] = []*DNSItem{
			{Type: "A", Host: strings.ReplaceAll(configData.WebDomain, "."+configData.Domain, ""), Value: ipValue, TTL: 3600, Tips: i18n.GetText(ctx.Lang, "ip_taps")},
			{Type: "A", Host: "smtp", Value: ipValue, TTL: 3600, Tips: i18n.GetText(ctx.Lang, "ip_taps")},
			{Type: "A", Host: "imap", Value: ipValue, TTL: 3600, Tips: i18n.GetText(ctx.Lang, "ip_taps")},
			{Type: "A", Host: "pop", Value: ipValue, TTL: 3600, Tips: i18n.GetText(ctx.Lang, "ip_taps")},
			{Type: "A", Host: "@", Value: ipValue, TTL: 3600, Tips: i18n.GetText(ctx.Lang, "ip_taps")},
			{Type: "MX", Host: "@", Value: fmt.Sprintf("smtp.%s", domain), TTL: 3600},
			{Type: "TXT", Host: "@", Value: "v=spf1 a mx ~all", TTL: 3600},
			{Type: "TXT", Host: "default._domainkey", Value: auth.DkimGen(), TTL: 3600},
		}
	}

	return ret, nil
}
