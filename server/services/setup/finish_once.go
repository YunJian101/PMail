package setup

import (
	"os"
	"strings"
	"sync"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/services/auth"
	log "github.com/sirupsen/logrus"
)

var (
	finishMu   sync.Mutex
	finishDone bool
)

// FinishOnce 在「配置真的齐了」之后才把安装标记为完成。
//
// 之所以不用 sync.Once：条件不满足时要允许用户补完再调用一次，
// 而 sync.Once 第一次就会把函数吃掉，后面永远等不到完成。
//
// 另外：切到正式模式后 parsemail.Init() 会读 config/dkim/dkim.priv，
// 文件不存在会直接 panic，所以收尾前先确保 DKIM 私钥已经生成。
//
// 返回值 (完成?, 还差什么)：前端把「还差什么」直接显示出来，
// 免得用户点了完成却卡在登录页。
func FinishOnce() (bool, string) {
	finishMu.Lock()
	defer finishMu.Unlock()

	if finishDone {
		return true, ""
	}

	cfg, err := config.ReadConfig()
	if err != nil {
		return false, err.Error()
	}

	if reason := missingReason(cfg); reason != "" {
		log.Warnf("setup: not finished yet, missing %s", reason)
		return false, reason
	}

	if key := auth.DkimGen(); key == "" {
		log.Warnf("setup: dkim key generation returned empty, install may fail after restart")
	}

	if err := Finish(); err != nil {
		return false, err.Error()
	}
	finishDone = true
	return true, ""
}

// missingReason 返回第一项没配好的东西；全都齐了返回空串。
// 这里不 import ssl 包（ssl 反过来依赖 setup，会成环），直接看文件在不在。
func missingReason(cfg *config.Config) string {
	if strings.TrimSpace(cfg.Domain) == "" || strings.TrimSpace(cfg.WebDomain) == "" {
		return "域名还没有配置"
	}
	if strings.TrimSpace(cfg.DbDSN) == "" {
		return "数据库还没有配置"
	}
	if account, err := GetAdminPassword(nil); err != nil {
		return "读取管理员账号失败：" + err.Error()
	} else if strings.TrimSpace(account) == "" {
		return "管理员账号还没有创建"
	}
	if !fileUsable(cfg.SSLPrivateKeyPath) || !fileUsable(cfg.SSLPublicKeyPath) {
		return "还没有可用的证书"
	}
	return ""
}

func fileUsable(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && info.Size() > 0
}
