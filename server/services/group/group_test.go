package group

import (
	"fmt"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/utils/context"
	"testing"
)

func TestGetGroupStatus(t *testing.T) {
	config.Init()
	// 这个用例依赖当前目录下的 config.json（真实数据库）。没有配置时
	// db.Init 会失败、db.Instance 为 nil，继续跑只会空指针 panic。
	if err := db.Init(""); err != nil || db.Instance == nil {
		t.Skip("没有可用的数据库配置，跳过")
	}
	db.Instance.ShowSQL(true)
	ctx := &context.Context{
		UserID:      1,
		UserName:    "admin",
		UserAccount: "admin",
	}
	ret, _ := GetGroupStatus(ctx, "INBOX", []string{"MESSAGES", "UIDNEXT", "UIDVALIDITY", "UNSEEN"})
	fmt.Println(ret)
}
