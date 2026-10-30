package email

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/services/detail"
	"github.com/Jinnrry/pmail/utils/array"
	"github.com/Jinnrry/pmail/utils/context"
	log "github.com/sirupsen/logrus"
)

type markReadRequest struct {
	IDs []int `json:"ids"`
	// 1 = 标为已读（缺省），0 = 标为未读。
	// 以前这个接口只会标已读，所以「标为未读」按钮点了等于没反应。
	IsRead *int8 `json:"is_read"`
}

func MarkRead(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	reqBytes, err := io.ReadAll(req.Body)
	if err != nil {
		log.WithContext(ctx).Errorf("%+v", err)
	}
	var reqData markReadRequest
	err = json.Unmarshal(reqBytes, &reqData)
	if err != nil {
		log.WithContext(ctx).Errorf("%+v", err)
	}

	if len(reqData.IDs) <= 0 {
		response.NewErrorResponse(response.ParamsError, "ID错误", "").FPrint(w)
		return
	}

	target := int8(1)
	if reqData.IsRead != nil {
		target = *reqData.IsRead
	}

	if target == 0 {
		// 标为未读：把 user_email.is_read 置 0
		if _, err := db.Instance.Exec(
			db.WithContext(ctx, "update user_email set is_read=0 where email_id in ("+array.Join(reqData.IDs, ",")+") and user_id=?"),
			ctx.UserID,
		); err != nil {
			log.WithContext(ctx).Errorf("%+v", err)
			response.NewErrorResponse(response.ServerError, err.Error(), "").FPrint(w)
			return
		}
		response.NewSuccessResponse("success").FPrint(w)
		return
	}

	for _, id := range reqData.IDs {
		detail.GetEmailDetail(ctx, id, true)
	}

	response.NewSuccessResponse("success").FPrint(w)
}
