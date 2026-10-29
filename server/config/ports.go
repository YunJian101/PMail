package config

import (
	"os"
	"strconv"
)

// 邮件协议端口原本写死在代码里（:25 / :465 / :587 / :993 / :110 / :995），
// 端口被占用时无法调整。这里统一改成「环境变量优先，缺省用标准端口」：
//
//	PMAIL_PORT_SMTP        默认 25
//	PMAIL_PORT_SMTPS       默认 465
//	PMAIL_PORT_SUBMISSION  默认 587
//	PMAIL_PORT_IMAP        默认 993
//	PMAIL_PORT_POP3        默认 110
//	PMAIL_PORT_POP3S       默认 995
//
// 飞牛 fpk 会把它们写进 ${TRIM_PKGVAR}/ports.env 再 source，Docker 部署用 compose 的
// environment 传即可。Web 端口不在这里，仍然用 config.json 的 httpPort / httpsPort。
func Port(name string, def int) int {
	raw := os.Getenv("PMAIL_PORT_" + name)
	if raw == "" {
		return def
	}
	port, err := strconv.Atoi(raw)
	if err != nil || port <= 0 || port > 65535 {
		return def
	}
	return port
}

// Addr 返回可直接给 net.Listen 用的 ":端口" 形式
func Addr(name string, def int) string {
	return ":" + strconv.Itoa(Port(name, def))
}
