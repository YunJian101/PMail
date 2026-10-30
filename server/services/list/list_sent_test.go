package list

import (
	"strings"
	"testing"

	"github.com/Jinnrry/pmail/consts"
	"github.com/Jinnrry/pmail/dto"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/utils/context"
)

// 发件箱的过滤条件必须排除「已经被移到别的分组」的邮件。
// 以前只判断 email.type=1，而移动邮件只改 user_email.group_id，
// 结果移到广告箱之后，发件箱里还会再显示一份。
func TestGenSQLSentExcludesMovedMail(t *testing.T) {
	ctx := &context.Context{}
	ctx.UserID = 1

	sql, params := genSQL(ctx, false, dto.SearchTag{Type: consts.EmailTypeSend, Status: -1}, "", false, 0, 20)

	if !strings.Contains(sql, "ue.group_id = 0") {
		t.Fatalf("发件箱条件没有排除已移走的邮件：%s", sql)
	}
	if !strings.Contains(sql, "type = ?") {
		t.Fatalf("发件箱条件丢了 type 判断：%s", sql)
	}

	found := false
	for _, p := range params {
		if v, ok := p.(int); ok && v == models.Sent {
			found = true
		}
	}
	if !found {
		t.Fatalf("发件箱条件缺少 models.Sent 参数：%v", params)
	}
}

// 收件箱条件也要限定分组，否则移到自定义分组后仍会显示在收件箱
func TestGenSQLInboxLimitsGroup(t *testing.T) {
	ctx := &context.Context{}
	ctx.UserID = 1

	sql, _ := genSQL(ctx, false, dto.SearchTag{Type: consts.EmailTypeReceive, Status: -1, GroupId: 0}, "", false, 0, 20)

	if !strings.Contains(sql, "ue.group_id") {
		t.Fatalf("收件箱条件没有限定分组：%s", sql)
	}
}
