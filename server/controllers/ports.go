package controllers

import (
	"net/http"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/listen/mailstatus"
	"github.com/Jinnrry/pmail/utils/context"
)

// PortsInfo 返回网页端口与各邮件端口的监听状态。
// 端口被占用时应用不会退出，靠这个接口让用户在设置页看到"哪个端口没起来"。
func PortsInfo(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	response.NewSuccessResponse(map[string]any{
		"webPort": config.Instance.HttpPort,
		"ports":   mailstatus.Snapshot(),
	}).FPrint(w)
}
