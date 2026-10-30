package controllers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/i18n"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/session"
	"github.com/Jinnrry/pmail/utils/context"
	"github.com/Jinnrry/pmail/utils/password"
	log "github.com/sirupsen/logrus"
)

type modifyPasswordRequest struct {
	// 旧密码：必填，防止拿到会话的人直接改密码
	OldPassword string `json:"old_password"`
	Password    string `json:"password"`
}

const minPasswordLen = 8

func ModifyPassword(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	reqBytes, err := io.ReadAll(req.Body)
	if err != nil {
		log.Errorf("%+v", err)
	}
	var retData modifyPasswordRequest
	if err := json.Unmarshal(reqBytes, &retData); err != nil {
		log.Errorf("%+v", err)
	}

	if retData.Password == "" || retData.OldPassword == "" {
		response.NewErrorResponse(response.ParamsError, "旧密码和新密码都要填", "").FPrint(w)
		return
	}

	if len([]rune(retData.Password)) < minPasswordLen {
		response.NewErrorResponse(response.ParamsError, "新密码至少 8 位", "").FPrint(w)
		return
	}

	if retData.Password == retData.OldPassword {
		response.NewErrorResponse(response.ParamsError, "新密码不能和旧密码相同", "").FPrint(w)
		return
	}

	var user models.User
	if _, err := db.Instance.ID(ctx.UserID).Get(&user); err != nil || user.ID == 0 {
		response.NewErrorResponse(response.ServerError, "读取账号失败", "").FPrint(w)
		return
	}

	if !password.Verify(retData.OldPassword, user.Password) {
		response.NewErrorResponse(response.ParamsError, "旧密码不正确", "").FPrint(w)
		return
	}

	encodePwd := password.Encode(retData.Password)
	if _, err := db.Instance.Table("user").Where("id=?", ctx.UserID).Update(map[string]interface{}{"password": encodePwd}); err != nil {
		response.NewErrorResponse(response.ServerError, i18n.GetText(ctx.Lang, "unknowError"), "").FPrint(w)
		return
	}

	response.NewSuccessResponse(i18n.GetText(ctx.Lang, "succ")).FPrint(w)
}

type updateProfileRequest struct {
	Name string `json:"name"`
}

// UpdateProfile 只允许改自己的显示名。
// 不接受目标用户 id —— 从根上避免越权；登录名（account）也不能在这里改。
func UpdateProfile(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	reqBytes, err := io.ReadAll(req.Body)
	if err != nil {
		response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
		return
	}

	var retData updateProfileRequest
	if err := json.Unmarshal(reqBytes, &retData); err != nil {
		response.NewErrorResponse(response.ParamsError, "参数格式不对", "").FPrint(w)
		return
	}

	name := strings.TrimSpace(retData.Name)
	if name == "" {
		response.NewErrorResponse(response.ParamsError, "显示名称不能为空", "").FPrint(w)
		return
	}
	if len([]rune(name)) > 50 {
		response.NewErrorResponse(response.ParamsError, "显示名称最多 50 个字符", "").FPrint(w)
		return
	}

	var user models.User
	if _, err := db.Instance.ID(ctx.UserID).Get(&user); err != nil || user.ID == 0 {
		response.NewErrorResponse(response.ServerError, "读取账号失败", "").FPrint(w)
		return
	}

	if _, err := db.Instance.ID(ctx.UserID).Cols("name").Update(&models.User{Name: name}); err != nil {
		response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
		return
	}

	// 会话里那份用户快照同步更新，避免还有读快照的地方显示旧名字
	if _, err := db.Instance.ID(ctx.UserID).Get(&user); err == nil {
		if snapshot, err := json.Marshal(user); err == nil {
			session.Instance.Put(ctx.Context, "user", string(snapshot))
		}
	}

	response.NewSuccessResponse(map[string]string{
		"account": user.Account,
		"name":    name,
	}).FPrint(w)
}
