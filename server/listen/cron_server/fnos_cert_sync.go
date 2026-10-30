package cron_server

import (
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/services/setup/ssl"
	"github.com/Jinnrry/pmail/signal"
	log "github.com/sirupsen/logrus"
)

// 飞牛证书自动同步：每 12 小时比对一次飞牛证书目录与本地 config/ssl，
// 内容有变化才覆盖并触发重启（SMTP/IMAP/POP3/HTTPS 在启动时加载证书）。
//
// 只有 sslSource=fnos 且开关打开时才跑——用户手动粘贴的证书不会被悄悄覆盖。
// 测试时可用环境变量 PMAIL_FNOS_CERT_INTERVAL（分钟）缩短间隔。

var (
	fnosCertMu       sync.Mutex
	fnosCertLastSync time.Time
)

// FnOsCertLastSync 暴露给设置接口展示「上次自动同步时间」
func FnOsCertLastSync() time.Time {
	fnosCertMu.Lock()
	defer fnosCertMu.Unlock()
	return fnosCertLastSync
}

func fnosCertEnabled() bool {
	if config.Instance == nil || !config.IsInit {
		return false
	}
	// 开关默认开；只有显式设为 false 才关
	if config.Instance.AutoSyncFnOsCert != nil && !*config.Instance.AutoSyncFnOsCert {
		return false
	}
	return ssl.FnOsCertRootExists()
}

func fnosCertInterval() time.Duration {
	if raw := os.Getenv("PMAIL_FNOS_CERT_INTERVAL"); raw != "" {
		if minutes, err := strconv.Atoi(raw); err == nil && minutes > 0 {
			return time.Duration(minutes) * time.Minute
		}
	}
	return 12 * time.Hour
}

func fnosCertLoop() {
	// 启动后先歇一会儿，等服务全起来再查第一次
	time.Sleep(2 * time.Minute)

	for {
		if fnosCertEnabled() {
			runFnOsCertSync()
		}
		time.Sleep(fnosCertInterval())
	}
}

func runFnOsCertSync() {
	fnosCertMu.Lock()
	defer fnosCertMu.Unlock()

	changed, info := ssl.SyncFnOsCert(false)
	fnosCertLastSync = time.Now()

	switch {
	case changed:
		log.Infof("fnos cert renewed, restarting to reload TLS: domain=%s expire=%s", info.Domain, info.Expire)
		signal.RestartChan <- true
	case info.Found:
		log.Debugf("fnos cert unchanged (expire=%s)", info.Expire)
	case info.Message != "":
		log.Warnf("fnos cert sync skipped: %s", info.Message)
	}
}
