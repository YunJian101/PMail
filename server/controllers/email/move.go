package email

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/services/group"
	"github.com/Jinnrry/pmail/utils/array"
	"github.com/Jinnrry/pmail/utils/context"
	log "github.com/sirupsen/logrus"
)

type moveRequest struct {
	GroupId   int    `json:"group_id"`
	GroupName string `json:"group_name"`
	IDs       []int  `json:"ids"`
}

// 内置箱子的编号都从 20 亿开始，自定义分组 id 都是小数字
const builtinBoxBase = 2000000000

type errorString string

func (e errorString) Error() string { return string(e) }

// checkMove 按「邮件性质」校验移动是否合法：
// 收到的邮件不能进发件箱/草稿箱，发出的邮件不能进收件箱/垃圾箱；
// 回收站里的邮件只能还原，不能随意移到别的箱子。
func checkMove(ctx *context.Context, ids []int, toBox int) error {
	for _, id := range ids {
		var email models.Email
		if _, err := db.Instance.ID(id).Get(&email); err != nil || email.Id == 0 {
			return errorString("邮件不存在")
		}

		var ue models.UserEmail
		if _, err := db.Instance.Where("email_id=? and user_id=?", id, ctx.UserID).Get(&ue); err != nil || ue.ID == 0 {
			return errorString("邮件不存在")
		}

		// 回收站里的邮件只能「还原」
		if ue.GroupId == models.Deleted || ue.Status == 3 {
			if toBox != models.Deleted {
				return errorString("已删除的邮件只能还原，不能移动到其它箱子")
			}
			continue
		}

		// 自定义分组：任何邮件都可以归档
		if toBox > 0 && toBox < builtinBoxBase {
			continue
		}

		if err := group.CheckMoveTarget(email.Type, ue.Status, toBox); err != nil {
			return err
		}
	}
	return nil
}

func Move(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	reqBytes, err := io.ReadAll(req.Body)
	if err != nil {
		log.WithContext(ctx).Errorf("%+v", err)
	}
	var reqData moveRequest
	if err := json.Unmarshal(reqBytes, &reqData); err != nil {
		log.WithContext(ctx).Errorf("%+v", err)
	}

	if len(reqData.IDs) <= 0 {
		response.NewErrorResponse(response.ParamsError, "ID错误", "").FPrint(w)
		return
	}

	// 目标箱子：内置箱传的是编号，自定义分组传的是分组 id
	target := reqData.GroupId
	if name, ok := models.GroupCodeToName[reqData.GroupId]; ok {
		target = models.GroupNameToCode[name]
	}

	if err := checkMove(ctx, reqData.IDs, target); err != nil {
		response.NewErrorResponse(response.ParamsError, err.Error(), "").FPrint(w)
		return
	}

	if name, ok := models.GroupCodeToName[reqData.GroupId]; ok {
		if err := group.Move2DefaultBox(ctx, reqData.IDs, name); err != nil {
			response.NewErrorResponse(response.ServerError, "Error", err.Error()).FPrint(w)
			return
		}
	} else if !group.MoveMailToGroup(ctx, reqData.IDs, reqData.GroupId) {
		response.NewErrorResponse(response.ServerError, "Error", "").FPrint(w)
		return
	}
	response.NewSuccessResponse("success").FPrint(w)
}

type restoreRequest struct {
	IDs []int `json:"ids"`
}

// Restore 把「已删除」里的邮件原路退回它进来之前的箱子
func Restore(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	reqBytes, err := io.ReadAll(req.Body)
	if err != nil {
		log.WithContext(ctx).Errorf("%+v", err)
	}
	var reqData restoreRequest
	if err := json.Unmarshal(reqBytes, &reqData); err != nil {
		log.WithContext(ctx).Errorf("%+v", err)
	}

	if len(reqData.IDs) <= 0 {
		response.NewErrorResponse(response.ParamsError, "ID错误", "").FPrint(w)
		return
	}

	if err := group.RestoreFromDeleted(ctx, reqData.IDs); err != nil {
		response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
		return
	}

	log.WithContext(ctx).Infof("restored %s from trash", array.Join(reqData.IDs, ","))
	response.NewSuccessResponse("success").FPrint(w)
}
