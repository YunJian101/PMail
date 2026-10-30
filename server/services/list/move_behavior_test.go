package list

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/consts"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/dto"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/services/group"
	"github.com/Jinnrry/pmail/utils/context"
)

// 用真实 sqlite + 真实的移动函数，验证「移动到别的箱子后，原箱子不再显示」。
// 之前的问题：内置箱移动只改 status 并把 group_id 归零，
// 原箱子仍然命中，邮件就同时出现在两个箱子里。
func TestMoveBetweenBoxesKeepsSingleLocation(t *testing.T) {
	cases := []struct {
		name      string
		status    int8
		emailType int8
		fromTag   dto.SearchTag
		toBox     string
		toTag     dto.SearchTag
	}{
		{
			name:      "发件箱 -> 广告箱",
			status:    1,
			emailType: consts.EmailTypeSend,
			fromTag:   dto.SearchTag{Type: consts.EmailTypeSend, Status: -1},
			toBox:     "Junk",
			toTag:     dto.SearchTag{Type: -1, Status: consts.EmailStatusJunk},
		},
		{
			name:      "草稿箱 -> 广告箱",
			status:    4,
			emailType: consts.EmailTypeReceive,
			fromTag:   dto.SearchTag{Type: 0, Status: consts.EmailStatusDrafts},
			toBox:     "Junk",
			toTag:     dto.SearchTag{Type: -1, Status: consts.EmailStatusJunk},
		},
		{
			name:      "收件箱 -> 广告箱",
			status:    0,
			emailType: consts.EmailTypeReceive,
			fromTag:   dto.SearchTag{Type: consts.EmailTypeReceive, Status: -1, GroupId: 0},
			toBox:     "Junk",
			toTag:     dto.SearchTag{Type: -1, Status: consts.EmailStatusJunk},
		},
		{
			name:      "广告箱 -> 已删除",
			status:    5,
			emailType: consts.EmailTypeReceive,
			fromTag:   dto.SearchTag{Type: -1, Status: consts.EmailStatusJunk},
			toBox:     "Deleted Messages",
			toTag:     dto.SearchTag{Type: -1, Status: consts.EmailStatusDel},
		},
		{
			name:      "已删除 -> 收件箱",
			status:    3,
			emailType: consts.EmailTypeReceive,
			fromTag:   dto.SearchTag{Type: -1, Status: consts.EmailStatusDel},
			toBox:     "INBOX",
			toTag:     dto.SearchTag{Type: consts.EmailTypeReceive, Status: -1, GroupId: 0},
		},
		{
			name:      "收件箱 -> 发件箱",
			status:    0,
			emailType: consts.EmailTypeReceive,
			fromTag:   dto.SearchTag{Type: consts.EmailTypeReceive, Status: -1, GroupId: 0},
			toBox:     "Sent Messages",
			toTag:     dto.SearchTag{Type: consts.EmailTypeSend, Status: -1},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := newTestCtx(t)

			email := &models.Email{Type: tc.emailType, Subject: tc.name}
			if _, err := db.Instance.Insert(email); err != nil {
				t.Fatalf("insert email: %v", err)
			}
			if _, err := db.Instance.Insert(&models.UserEmail{
				UserID: ctx.UserID, EmailID: email.Id, GroupId: 0, Status: tc.status, IsRead: 1,
			}); err != nil {
				t.Fatalf("insert user_email: %v", err)
			}

			if got := countList(ctx, tc.fromTag); got != 1 {
				t.Fatalf("移动前「%s」应该有 1 封，实际 %d", tc.name, got)
			}

			if err := group.Move2DefaultBox(ctx, []int{email.Id}, tc.toBox); err != nil {
				t.Fatalf("move: %v", err)
			}

			if got := countList(ctx, tc.toTag); got != 1 {
				t.Fatalf("移动后目标箱子应该有 1 封，实际 %d", got)
			}
			if got := countList(ctx, tc.fromTag); got != 0 {
				t.Fatalf("移动后原箱子不该再有这封邮件，实际 %d", got)
			}
		})
	}
}

// 移到自定义分组后，内置箱子也不该再显示
func TestMoveToCustomGroupLeavesBuiltInBox(t *testing.T) {
	ctx := newTestCtx(t)

	custom := &models.Group{Name: "归档", ParentId: 0, UserId: ctx.UserID, FullPath: "归档"}
	if _, err := db.Instance.Insert(custom); err != nil {
		t.Fatalf("insert group: %v", err)
	}

	email := &models.Email{Type: consts.EmailTypeReceive, Subject: "custom move"}
	if _, err := db.Instance.Insert(email); err != nil {
		t.Fatalf("insert email: %v", err)
	}
	if _, err := db.Instance.Insert(&models.UserEmail{UserID: ctx.UserID, EmailID: email.Id, GroupId: 0, Status: 0, IsRead: 1}); err != nil {
		t.Fatalf("insert user_email: %v", err)
	}

	inboxTag := dto.SearchTag{Type: consts.EmailTypeReceive, Status: -1, GroupId: 0}
	if got := countList(ctx, inboxTag); got != 1 {
		t.Fatalf("收件箱初始应该有 1 封，实际 %d", got)
	}

	if !group.MoveMailToGroup(ctx, []int{email.Id}, custom.ID) {
		t.Fatal("move to custom group failed")
	}

	if got := countList(ctx, inboxTag); got != 0 {
		t.Fatalf("移到自定义分组后收件箱不该显示，实际 %d", got)
	}
	if got := countList(ctx, dto.SearchTag{Type: 0, Status: -1, GroupId: custom.ID}); got != 1 {
		t.Fatalf("自定义分组应该有 1 封，实际 %d", got)
	}
}

func countList(ctx *context.Context, tag dto.SearchTag) int64 {
	_, total := GetEmailList(ctx, tag, "", false, 0, 20)
	return total
}

func newTestCtx(t *testing.T) *context.Context {
	t.Helper()

	oldRoot := config.ROOT_PATH
	root := t.TempDir()
	config.ROOT_PATH = root
	if err := os.MkdirAll(filepath.Join(root, "config"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	dbPath := filepath.Join(root, "config", "pmail.db")
	cfg := config.Config{
		Domain: "test.domain", Domains: []string{"test.domain"}, WebDomain: "mail.test.domain",
		DbType: config.DBTypeSQLite, DbDSN: dbPath, SSLType: config.SSLTypeUser,
		SSLPrivateKeyPath: filepath.Join(root, "config", "ssl", "private.key"),
		SSLPublicKeyPath:  filepath.Join(root, "config", "ssl", "public.crt"),
		HttpsEnabled:      2, IsInit: true,
	}
	raw, _ := json.Marshal(cfg)
	if err := os.WriteFile(filepath.Join(root, "config", "config.json"), raw, 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	config.Init()
	if err := db.Init("test"); err != nil {
		t.Fatalf("db init: %v", err)
	}
	t.Cleanup(func() {
		if db.Instance != nil {
			_ = db.Instance.Close()
			db.Instance = nil
		}
		config.ROOT_PATH = oldRoot
	})

	ctx := &context.Context{}
	ctx.UserID = 1
	return ctx
}
