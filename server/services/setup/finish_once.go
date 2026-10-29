package setup

import (
	"sync"

	"github.com/Jinnrry/pmail/services/auth"
	log "github.com/sirupsen/logrus"
)

var finishOnce sync.Once

// FinishOnce 保证「标记安装完成」只执行一次。
// 原来的 Finish() 会往无缓冲 channel 写，重复调用会永久阻塞。
//
// 另外：切到正式模式后 parsemail.Init() 会读取 config/dkim/dkim.priv，
// 文件不存在会直接 panic。所以收尾前先确保 DKIM 私钥已经生成
// （正常情况下走一遍 DNS 步骤会生成，但用户跳过那一步就没有）。
func FinishOnce() {
	finishOnce.Do(func() {
		if key := auth.DkimGen(); key == "" {
			log.Warnf("setup: dkim key generation returned empty, install may fail after restart")
		}
		_ = Finish()
	})
}
