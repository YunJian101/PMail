package controllers

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/signal"
	"github.com/Jinnrry/pmail/utils/context"
	log "github.com/sirupsen/logrus"
)

// 邮件端口 → ports.env 里的键名
var mailPortKeys = []struct {
	key   string
	label string
}{
	{"PMAIL_PORT_SMTP", "SMTP"},
	{"PMAIL_PORT_SMTPS", "SMTPS"},
	{"PMAIL_PORT_SUBMISSION", "SUBMISSION"},
	{"PMAIL_PORT_IMAP", "IMAP"},
	{"PMAIL_PORT_POP3", "POP3"},
	{"PMAIL_PORT_POP3S", "POP3S"},
}

type mailPortsRequest struct {
	Ports map[string]string `json:"ports"`
}

func portsEnvPath() string {
	return filepath.Join(config.ROOT_PATH, "ports.env")
}

// readPortsEnv 读 ports.env 成 map
func readPortsEnv() map[string]string {
	ret := map[string]string{}
	raw, err := os.ReadFile(portsEnvPath())
	if err != nil {
		return ret
	}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if idx := strings.Index(line, "="); idx > 0 {
			ret[strings.TrimSpace(line[:idx])] = strings.TrimSpace(line[idx+1:])
		}
	}
	return ret
}

// UpdateMailPorts 修改邮件端口：写 ports.env 后重启应用生效
func UpdateMailPorts(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	if !ctx.IsAdmin {
		response.NewErrorResponse(response.NoAccessPrivileges, "No Access Privileges", "").FPrint(w)
		return
	}

	reqBytes, err := io.ReadAll(req.Body)
	if err != nil {
		response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
		return
	}

	var reqData mailPortsRequest
	if err := json.Unmarshal(reqBytes, &reqData); err != nil {
		response.NewErrorResponse(response.ParamsError, "参数格式不对", "").FPrint(w)
		return
	}

	current := readPortsEnv()

	for _, item := range mailPortKeys {
		raw, ok := reqData.Ports[item.key]
		if !ok {
			continue
		}
		value := strings.TrimSpace(raw)
		port, convErr := strconv.Atoi(value)
		if convErr != nil || port < 1 || port > 65535 {
			response.NewErrorResponse(response.ParamsError, item.label+" 端口必须是 1-65535 的数字", "").FPrint(w)
			return
		}
		current[item.key] = strconv.Itoa(port)
	}

	// 写回：保持键顺序稳定，方便人工检查
	keys := make([]string, 0, len(current))
	for k := range current {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var sb strings.Builder
	sb.WriteString("# PMail 端口配置：改完需重启应用生效\n")
	for _, k := range keys {
		sb.WriteString(k + "=" + current[k] + "\n")
	}

	if err := os.WriteFile(portsEnvPath(), []byte(sb.String()), 0o644); err != nil {
		response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
		return
	}

	log.Infof("mail ports updated, restarting: %v", current)

	// 端口要重启才生效；异步触发，先把响应回给前端
	go func() {
		if signal.RestartChan != nil {
			signal.RestartChan <- true
		}
	}()

	response.NewSuccessResponse(map[string]any{
		"restart": true,
		"ports":   current,
	}).FPrint(w)
}
