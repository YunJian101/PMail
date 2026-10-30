package group

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/consts"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/utils/context"
)

// 每个内置箱子里的未读都要能算出来（侧边栏徽标用）。
func TestUnreadCountPerBox(t *testing.T) {
	ctx := newGroupTestCtx(t)

	cases := []struct {
		boxName   string
		status    int8
		emailType int8
		groupID   int
	}{
		{"INBOX", 0, consts.EmailTypeReceive, 0},
		{"Drafts", consts.EmailStatusDrafts, 0, 0},
		{"Junk", consts.EmailStatusJunk, 0, 0},
		// 发件箱按设计不显示未读数，这里跳过
	}

	for _, tc := range cases {
		email := &models.Email{Type: tc.emailType, Subject: "unread-" + tc.boxName}
		if _, err := db.Instance.Insert(email); err != nil {
			t.Fatalf("insert email: %v", err)
		}
		if _, err := db.Instance.Insert(&models.UserEmail{
			UserID: ctx.UserID, EmailID: email.Id, GroupId: tc.groupID, Status: tc.status, IsRead: 0,
		}); err != nil {
			t.Fatalf("insert user_email: %v", err)
		}

		_, counts := GetGroupStatus(ctx, tc.boxName, []string{"UNSEEN", "MESSAGES"})
		if counts["UNSEEN"] != 1 {
			t.Fatalf("%s 未读数应该是 1，实际 %d", tc.boxName, counts["UNSEEN"])
		}
		if counts["MESSAGES"] < 1 {
			t.Fatalf("%s 总数应该 >=1，实际 %d", tc.boxName, counts["MESSAGES"])
		}
	}

	// 标为已读后未读数归零
	if _, err := db.Instance.Exec("update user_email set is_read=1"); err != nil {
		t.Fatalf("mark read: %v", err)
	}
	_, counts := GetGroupStatus(ctx, "Drafts", []string{"UNSEEN"})
	if counts["UNSEEN"] != 0 {
		t.Fatalf("标已读后草稿箱未读数应为 0，实际 %d", counts["UNSEEN"])
	}
}

func newGroupTestCtx(t *testing.T) *context.Context {
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
