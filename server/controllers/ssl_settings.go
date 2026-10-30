package controllers

import (
	"io"
	"net/http"
	"time"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/listen/cron_server"
	"github.com/Jinnrry/pmail/services/setup/ssl"
	"github.com/Jinnrry/pmail/signal"
	"github.com/Jinnrry/pmail/utils/context"
	log "github.com/sirupsen/logrus"
)

// sslInfoResponse 是设置页「证书状态」卡片的返回
type sslInfoResponse struct {
	// 当前生效证书
	Domain     string `json:"domain"`
	Expire     string `json:"expire"`
	DaysLeft   int    `json:"daysLeft"`
	SourceType string `json:"source"`        // fnos / upload / 空
	AutoSync   bool   `json:"autoSync"`      // 自动跟随飞牛续期是否开启
	LastSync   string `json:"lastSync"`      // 上次自动同步时间（空=还没同步过）
	FnosRootOk bool   `json:"fnosRootOk"`    // 飞牛证书目录是否存在
}

// SslInfo GET /api/settings/ssl_info —— 读当前证书状态
func SslInfo(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	info := sslInfoResponse{
		SourceType: config.Instance.SSLSource,
		AutoSync:   config.Instance.AutoSyncFnOsCert == nil || *config.Instance.AutoSyncFnOsCert,
	}

	days, expire, _, err := ssl.CheckSSLCrtInfo()
	if err == nil {
		info.DaysLeft = days
		info.Expire = expire.Format("2006-01-02")
	}
	// 域名单独取（CheckSSLCrtInfo 只回到期日）
	if domain, _, err := ssl.CertSummary(); err == nil {
		info.Domain = domain
	}

	if last := cron_server.FnOsCertLastSync(); !last.IsZero() {
		info.LastSync = last.Format("2006-01-02 15:04")
	}

	response.NewSuccessResponse(info).FPrint(w)
}

// SslReload POST /api/settings/reload_cert —— 手动重新从飞牛加载证书
func SslReload(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	_, _ = io.ReadAll(req.Body)

	// 手动粘贴证书（upload）的用户不该被这个按钮覆盖自己的证书
	if config.Instance.SSLSource == "upload" {
		response.NewErrorResponse(response.ServerError,
			"当前证书是手动粘贴的，重新从飞牛加载会覆盖它；请先在安装向导里重新选择", "").FPrint(w)
		return
	}

	changed, certInfo := ssl.SyncFnOsCert(true)
	if !certInfo.Found {
		response.NewErrorResponse(response.ServerError, certInfo.Message, "").FPrint(w)
		return
	}

	if changed {
		log.Infof("manual fnos cert reload: domain=%s expire=%s, restarting", certInfo.Domain, certInfo.Expire)
		// 异步触发重启，先把成功响应发回去
		go func() {
			time.Sleep(300 * time.Millisecond)
			signal.RestartChan <- true
		}()
	}

	response.NewSuccessResponse(map[string]any{
		"changed": changed,
		"domain":  certInfo.Domain,
		"expire":  certInfo.Expire,
	}).FPrint(w)
}
