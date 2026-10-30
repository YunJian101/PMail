package controllers

import (
	"net/http"

	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/utils/version"
)

// VersionInfo 不需要登录也能看：登录页和安装页都要显示版本号
func VersionInfo(w http.ResponseWriter, req *http.Request) {
	response.NewSuccessResponse(version.Info()).FPrint(w)
}
