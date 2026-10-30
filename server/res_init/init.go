package res_init

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"fmt"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/dto/parsemail"
	"github.com/Jinnrry/pmail/hooks"
	"github.com/Jinnrry/pmail/listen/http_server"
	"github.com/Jinnrry/pmail/listen/imap_server"
	"github.com/Jinnrry/pmail/listen/pop3_server"
	"github.com/Jinnrry/pmail/listen/smtp_server"
	"github.com/Jinnrry/pmail/services/setup/ssl"
	"github.com/Jinnrry/pmail/session"
	"github.com/Jinnrry/pmail/signal"
	"github.com/Jinnrry/pmail/utils/file"
	log "github.com/sirupsen/logrus"
	// 新增：HTTP 就绪探测
	"net/http"
)

func Init(serverVersion string) {

	if !config.IsInit {
		dirInit()

		go http_server.SetupStart()
		<-signal.InitChan
		http_server.SetupStop()
	}

	for {
		config.Init()
		// 移除：启动前立即更新证书的调用，避免 HTTP 未启动时触发 ACME
		// ssl.Update(false)

		parsemail.Init()
		err := db.Init(serverVersion)
		if err != nil {
			panic(err)
		}

		// 数据库就绪后修一次历史遗留的「邮箱域名填成 smtp.xxx」问题（幂等、有备份）
		migrateMailDomain()

		session.Init()
		hooks.Init(serverVersion)
		// smtp server start
		go smtp_server.Start()
		go smtp_server.StartWithTLS()
		go smtp_server.StartWithTLSNew()
		// http server start
		go http_server.HttpsStart()
		go http_server.HttpStart()

		// 等待 HTTP 服务就绪后再执行证书检查/续期，避免 ACME 验证失败
		waitHTTPReady()

		// 启动后检查一遍证书（非重启模式）
		ssl.Update(false)

		// pop3 server start
		go pop3_server.Start()
		go pop3_server.StartWithTls()
		// imap server start
		go imap_server.StarTLS()

		configStr, _ := json.Marshal(config.Instance)
		log.Warnf("Config File Info:  %s", configStr)

		select {
		case <-signal.RestartChan:
			log.Infof("Server Restart!")
			smtp_server.Stop()
			http_server.HttpsStop()
			http_server.HttpStop()
			pop3_server.Stop()
			imap_server.Stop()
			hooks.Stop()
		case <-signal.StopChan:
			log.Infof("Server Stop!")
			smtp_server.Stop()
			http_server.HttpsStop()
			http_server.HttpStop()
			pop3_server.Stop()
			imap_server.Stop()
			hooks.Stop()
			return
		}
		log.Infof("Server Stop Success!")
		time.Sleep(5 * time.Second)

	}

}

func dirInit() {
	// 目录要建在 ROOT_PATH 下，而不是「当前目录」：
	// 两者不一致时（PMail_ROOT 覆盖、go test、被别的进程拉起），
	// 配置目录建错地方会导致 DKIM / 证书找不到，安装收尾时直接 panic。
	base := config.ROOT_PATH
	if base == "" {
		base = "./"
	}

	for _, dir := range []string{"config", "config/dkim", "config/ssl"} {
		full := filepath.Join(base, dir)
		if file.PathExist(full) {
			continue
		}
		if err := os.MkdirAll(full, 0744); err != nil {
			panic(err)
		}
	}
}

// 新增：HTTP 就绪探测（最多等待 ~90 秒）
func waitHTTPReady() {
	port := 80
	if config.Instance != nil && config.Instance.HttpPort > 0 {
		port = config.Instance.HttpPort
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/api/ping", port)

	for i := 0; i < 90; i++ {
		resp, err := http.Get(url)
		if err == nil && resp != nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			log.Infof("HTTP ready: %s", url)
			return
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(1 * time.Second)
	}
	log.Warnf("HTTP not ready after 90s, skipping immediate SSL update")
}
