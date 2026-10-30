package email

import (
	"net/http"

	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/services/group"
	"github.com/Jinnrry/pmail/utils/context"
)

// UnreadCounts 返回各文件夹的未读数，key 用前端 URL 里的 slug
// （inbox / sent / drafts / junk / trash / group-<id>）。
// 侧边栏徽标和「收到新邮件」提示都靠它，15 秒轮询一次，开销很小。
func UnreadCounts(ctx *context.Context, w http.ResponseWriter, req *http.Request) {
	unseen := func(box string) int {
		_, counts := group.GetGroupStatus(ctx, box, []string{"UNSEEN"})
		return counts["UNSEEN"]
	}

	ret := map[string]int{
		"inbox":  unseen("INBOX"),
		"sent":   unseen("Sent Messages"),
		"drafts": unseen("Drafts"),
		"junk":   unseen("Junk"),
		"trash":  unseen("Deleted Messages"),
	}

	// 自定义分组：slug 形如 group-<id>
	for _, item := range group.GetGroupList(ctx) {
		ret["group-"+itoa(item.ID)] = unseen(item.FullPath)
	}

	response.NewSuccessResponse(ret).FPrint(w)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
