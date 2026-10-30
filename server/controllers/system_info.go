package controllers

import (
	"net/http"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/utils/context"
	"github.com/Jinnrry/pmail/utils/version"
)

// SystemInfo 给管理页一张「系统信息」卡片用：正在使用的端口与配置一屏看全。
func SystemInfo(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	info := version.Info()

	response.NewSuccessResponse(map[string]any{
		"version":   info["version"],
		"buildTime": info["buildTime"],
		"gitHash":   info["gitHash"],
		"goVersion": info["goVersion"],
		"domain":    config.Instance.Domain,
		"webDomain": config.Instance.WebDomain,
		"domains":   config.Instance.Domains,
		"webPort":   config.Instance.HttpPort,
		"dbType":    config.Instance.DbType,
		"dataDir":   config.ROOT_PATH,
		"sslSource": config.Instance.SSLSource,
	}).FPrint(w)
}
