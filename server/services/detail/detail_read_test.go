package detail

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

// 打开未读邮件必须真的标成已读，而且返回给前端的状态也要是已读。
// 之前返回的是更新前的 is_read=0，前端会当成「还是未读」，
// 于是刚点开就显示成未读、点「标为未读」又把它标回去。
func TestGetEmailDetailMarksRead(t *testing.T) {
	ctx := newDetailTestCtx(t)

	email := &models.Email{Type: consts.EmailTypeReceive, Subject: "hello"}
	if _, err := db.Instance.Insert(email); err != nil {
		t.Fatalf("insert email: %v", err)
	}
	ue := &models.UserEmail{UserID: ctx.UserID, EmailID: email.Id, GroupId: 0, Status: 0, IsRead: 0}
	if _, err := db.Instance.Insert(ue); err != nil {
		t.Fatalf("insert user_email: %v", err)
	}

	got, err := GetEmailDetail(ctx, email.Id, true)
	if err != nil {
		t.Fatalf("detail: %v", err)
	}
	if got.IsRead != 1 {
		t.Fatalf("返回的 is_read 应该是 1（已读），实际 %d", got.IsRead)
	}

	var after models.UserEmail
	if _, err := db.Instance.Where("email_id=? and user_id=?", email.Id, ctx.UserID).Get(&after); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if after.IsRead != 1 {
		t.Fatalf("数据库里 is_read 应该是 1，实际 %d", after.IsRead)
	}

	// 标为未读后再打开（markRead=false）不能把它改回已读
	if _, err := db.Instance.Exec("update user_email set is_read=0 where id=?", after.ID); err != nil {
		t.Fatalf("mark unread: %v", err)
	}
	if _, err := GetEmailDetail(ctx, email.Id, false); err != nil {
		t.Fatalf("detail again: %v", err)
	}
	var again models.UserEmail
	if _, err := db.Instance.Where("id=?", after.ID).Get(&again); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if again.IsRead != 0 {
		t.Fatalf("markRead=false 时不该改已读状态，实际 %d", again.IsRead)
	}
}

func newDetailTestCtx(t *testing.T) *context.Context {
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
	ctx.IsAdmin = true
	return ctx
}
