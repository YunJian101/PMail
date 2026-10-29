package controllers

import (
	"encoding/json"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/services/setup"
	"github.com/Jinnrry/pmail/services/setup/ssl"
	"github.com/Jinnrry/pmail/utils/context"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cast"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func AcmeChallenge(w http.ResponseWriter, r *http.Request) {
	log.Infof("AcmeChallenge: %s", r.URL.Path)
	instance := ssl.GetHttpChallengeInstance()
	token := strings.ReplaceAll(r.URL.Path, "/.well-known/acme-challenge/", "")
	auth, exist := instance.AuthInfo[token]
	if exist {
		w.Write([]byte(auth.KeyAuth))
	} else {
		log.Errorf("AcmeChallenge Error Token Infos:%+v", instance.AuthInfo)
		http.NotFound(w, r)
	}
}

type sslResponse struct {
	Port int    `json:"port"`
	Type string `json:"type"`
}

// certResponse = 证书摘要 + 安装是否真的收尾成功
type certResponse struct {
	ssl.CertInfo
	Finished bool   `json:"finished"`
	Reason   string `json:"reason"`
}

func withFinish(info ssl.CertInfo) certResponse {
	res := certResponse{CertInfo: info}
	if !info.Found {
		return res
	}
	res.Finished, res.Reason = setup.FinishOnce()
	return res
}

func Setup(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	reqBytes, err := io.ReadAll(req.Body)
	if err != nil {
		response.NewSuccessResponse("").FPrint(w)
		return
	}

	var reqData map[string]string
	err = json.Unmarshal(reqBytes, &reqData)
	if err != nil {
		response.NewErrorResponse(response.ServerError, "", err.Error()).FPrint(w)
		return
	}

	if reqData["step"] == "database" && reqData["action"] == "get" {
		dbType, dbDSN, err := setup.GetDatabaseSettings(ctx)
		if err != nil {
			response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
			return
		}

		response.NewSuccessResponse(map[string]string{
			"db_type": dbType,
			"db_dsn":  dbDSN,
		}).FPrint(w)
		return
	}

	if reqData["step"] == "database" && reqData["action"] == "set" {
		err := setup.SetDatabaseSettings(ctx, cast.ToString(reqData["db_type"]), cast.ToString(reqData["db_dsn"]))
		if err != nil {
			response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
			return
		}

		response.NewSuccessResponse("Succ").FPrint(w)
		return
	}

	if reqData["step"] == "password" && reqData["action"] == "get" {
		ok, err := setup.GetAdminPassword(ctx)
		if err != nil {
			response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
			return
		}
		response.NewSuccessResponse(ok).FPrint(w)
		return
	}

	if reqData["step"] == "password" && reqData["action"] == "set" {
		err := setup.SetAdminPassword(ctx, cast.ToString(reqData["account"]), cast.ToString(reqData["password"]))
		if err != nil {
			response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
			return
		}
		response.NewSuccessResponse("Succ").FPrint(w)
		return
	}

	if reqData["step"] == "domain" && reqData["action"] == "get" {
		smtpDomain, webDomain, domains, err := setup.GetDomainSettings()
		if err != nil {
			response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
			return
		}
		response.NewSuccessResponse(map[string]any{
			"smtp_domain": smtpDomain,
			"web_domain":  webDomain,
			"domains":     domains,
		}).FPrint(w)
		return
	}

	if reqData["step"] == "domain" && reqData["action"] == "set" {
		err := setup.SetDomainSettings(cast.ToString(reqData["smtp_domain"]), cast.ToString(reqData["web_domain"]), reqData["multi_domain"])
		if err != nil {
			response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
			return
		}
		response.NewSuccessResponse("Succ").FPrint(w)
		return
	}

	if reqData["step"] == "dns" && reqData["action"] == "get" {
		dnsInfos, err := setup.GetDNSSettings(ctx)
		if err != nil {
			response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
			return
		}
		response.NewSuccessResponse(dnsInfos).FPrint(w)
		return
	}

	if reqData["step"] == "ssl" && reqData["action"] == "get" {
		sslType := ssl.GetSSL()
		res := sslResponse{
			Type: sslType,
			Port: config.Instance.GetSetupPort(),
		}
		response.NewSuccessResponse(res).FPrint(w)
		return
	}

	if reqData["step"] == "ssl" && reqData["action"] == "getParams" {
		dnsChallenge := ssl.GetDnsChallengeInstance()

		response.NewSuccessResponse(dnsChallenge.GetDNSSettings(ctx)).FPrint(w)
		return
	}

	// 证书就位：飞牛自带证书 / 粘贴的 PEM 都走这里收尾
	// （只有「域名 + 数据库 + 管理员 + 证书」全齐了才会真的标记安装完成）
	if reqData["step"] == "ssl" && reqData["action"] == "loadFnOsCert" {
		info := ssl.LoadFnOsCert()
		response.NewSuccessResponse(withFinish(info)).FPrint(w)
		return
	}

	if reqData["step"] == "ssl" && reqData["action"] == "uploadCert" {
		info := ssl.SaveCertPEM([]byte(reqData["key"]), []byte(reqData["crt"]))
		response.NewSuccessResponse(withFinish(info)).FPrint(w)
		return
	}
	// 收尾：前端在证书就位之后调这个。缺任何一项都不会把安装标记完成。
	if reqData["step"] == "ssl" && reqData["action"] == "finish" {
		done, reason := setup.FinishOnce()
		response.NewSuccessResponse(map[string]any{"finished": done, "reason": reason}).FPrint(w)
		return
	}

	if reqData["step"] == "ssl" && reqData["action"] == "status" {
		state := ssl.GetCertState()
		if state.State == "ok" || state.State == "ok_fallback" {
			if !ssl.HasCertificate() {
				_ = ssl.EnsureSelfSigned()
			}
			// 证书可用了，把安装收尾（幂等，重复调用不会阻塞）
			done, reason := setup.FinishOnce()
			if !done {
				state.Error = reason
			}
		}
		response.NewSuccessResponse(state).FPrint(w)
		return
	}

	if reqData["step"] == "ssl" && reqData["action"] == "set" {

		keyPath := cast.ToString(reqData["key_path"])
		crtPath := cast.ToString(reqData["crt_path"])

		if reqData["ssl_type"] == config.SSLTypeUser {
			// 统一转成绝对路径再写进 config.json：
			// 相对路径是相对「进程当前目录」的，而 PMail 运行目录（ROOT_PATH）
			// 和当前目录不一定相同，写相对的会让证书在重启后找不到。
			var err error
			keyPath, err = filepath.Abs(keyPath)
			if err != nil {
				response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
				return
			}
			crtPath, err = filepath.Abs(crtPath)
			if err != nil {
				response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
				return
			}

			if _, err := os.Stat(keyPath); err != nil {
				response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
				return
			}

			if _, err := os.Stat(crtPath); err != nil {
				response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
				return
			}
		}

		err = ssl.SetSSL(cast.ToString(reqData["ssl_type"]), keyPath, crtPath)
		if err != nil {
			response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
			return
		}

		if reqData["ssl_type"] == config.SSLTypeAutoHTTP || reqData["ssl_type"] == config.SSLTypeAutoDNS {
			// 异步签发：立刻返回，前端轮询 action=status 拿进度。
			// 原来的同步实现会阻塞到 ACME 结束（DNS 挑战最长 60 分钟），前端早就超时了。
			state := ssl.StartGenSSL(false)
			response.NewSuccessResponse(state).FPrint(w)
			return
		}

		// 手动证书：文件已校验过，直接收尾
		done, reason := setup.FinishOnce()
		response.NewSuccessResponse(map[string]any{"finished": done, "reason": reason}).FPrint(w)
		return
	}

}
