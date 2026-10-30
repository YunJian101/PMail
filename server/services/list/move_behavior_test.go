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
	"github.com/Jinnrry/pmail/utils/context"
)

// 用真实 sqlite 复现「发件箱里的邮件移动到广告箱后，两个箱子都显示」的问题。
func TestMovedMailLeavesSourceFolder(t *testing.T) {
	oldRoot := config.ROOT_PATH
	t.Cleanup(func() { config.ROOT_PATH = oldRoot })

	root := t.TempDir()
	config.ROOT_PATH = root
	if err := os.MkdirAll(filepath.Join(root, "config"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	dbPath := filepath.Join(root, "config", "pmail.db")
	cfg := config.Config{
		Domain:            "test.domain",
		Domains:           []string{"test.domain"},
		WebDomain:         "mail.test.domain",
		DbType:            config.DBTypeSQLite,
		DbDSN:             dbPath,
		SSLType:           config.SSLTypeUser,
		SSLPrivateKeyPath: filepath.Join(root, "config", "ssl", "private.key"),
		SSLPublicKeyPath:  filepath.Join(root, "config", "ssl", "public.crt"),
		HttpsEnabled:      2,
		IsInit:            true,
	}
	raw, _ := json.Marshal(cfg)
	if err := os.WriteFile(filepath.Join(root, "config", "config.json"), raw, 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	config.Init()
	if err := db.Init("test"); err != nil {
		t.Fatalf("db init: %v", err)
	}
	defer func() {
		if db.Instance != nil {
			_ = db.Instance.Close()
			db.Instance = nil
		}
	}()

	// 一封"发出去的"邮件：email.type=1，user_email.status=1、group_id=0（默认位置）
	email := &models.Email{Type: consts.EmailTypeSend, Subject: "sent mail"}
	if _, err := db.Instance.Insert(email); err != nil {
		t.Fatalf("insert email: %v", err)
	}
	ue := &models.UserEmail{UserID: 1, EmailID: email.Id, GroupId: 0, Status: 1, IsRead: 1}
	if _, err := db.Instance.Insert(ue); err != nil {
		t.Fatalf("insert user_email: %v", err)
	}

	ctx := &context.Context{}
	ctx.UserID = 1

	sentTag := dto.SearchTag{Type: consts.EmailTypeSend, Status: -1}
	junkTag := dto.SearchTag{Type: -1, Status: consts.EmailStatusJunk}

	_, total := GetEmailList(ctx, sentTag, "", false, 0, 20)
	if total != 1 {
		t.Fatalf("发件箱初始应该有 1 封，实际 %d", total)
	}

	// 移动到广告箱：只改 group_id（和线上 MoveMailToGroup 一致）
	if _, err := db.Instance.Exec("update user_email set group_id=? where email_id=?", models.Junk, email.Id); err != nil {
		t.Fatalf("move: %v", err)
	}

	_, sentAfter := GetEmailList(ctx, sentTag, "", false, 0, 20)
	_, junkAfter := GetEmailList(ctx, junkTag, "", false, 0, 20)

	if junkAfter != 1 {
		t.Fatalf("广告箱应该有 1 封，实际 %d", junkAfter)
	}
	if sentAfter != 0 {
		t.Fatalf("发件箱不该再显示已移走的邮件，实际 %d", sentAfter)
	}
}

// 草稿箱/已删除/广告箱这些「按 status 认」的箱子，作为源时是否有同样问题
func TestMovedMailLeavesStatusBasedFolder(t *testing.T) {
	oldRoot := config.ROOT_PATH
	t.Cleanup(func() { config.ROOT_PATH = oldRoot })

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
	_ = os.WriteFile(filepath.Join(root, "config", "config.json"), raw, 0o644)

	config.Init()
	if err := db.Init("test"); err != nil {
		t.Fatalf("db init: %v", err)
	}
	defer func() {
		if db.Instance != nil {
			_ = db.Instance.Close()
			db.Instance = nil
		}
	}()

	// 一封草稿：user_email.status=4
	email := &models.Email{Type: consts.EmailTypeReceive, Subject: "draft"}
	if _, err := db.Instance.Insert(email); err != nil {
		t.Fatalf("insert email: %v", err)
	}
	if _, err := db.Instance.Insert(&models.UserEmail{UserID: 1, EmailID: email.Id, GroupId: 0, Status: 4, IsRead: 1}); err != nil {
		t.Fatalf("insert user_email: %v", err)
	}

	ctx := &context.Context{}
	ctx.UserID = 1
	draftTag := dto.SearchTag{Type: 0, Status: consts.EmailStatusDrafts}
	junkTag := dto.SearchTag{Type: -1, Status: consts.EmailStatusJunk}

	if _, total := GetEmailList(ctx, draftTag, "", false, 0, 20); total != 1 {
		t.Fatalf("草稿箱初始应该有 1 封，实际 %d", total)
	}

	// 移到广告箱：只改 group_id
	if _, err := db.Instance.Exec("update user_email set group_id=? where email_id=?", models.Junk, email.Id); err != nil {
		t.Fatalf("move: %v", err)
	}

	_, draftAfter := GetEmailList(ctx, draftTag, "", false, 0, 20)
	_, junkAfter := GetEmailList(ctx, junkTag, "", false, 0, 20)
	if junkAfter != 1 {
		t.Fatalf("广告箱应该有 1 封，实际 %d", junkAfter)
	}
	if draftAfter != 0 {
		t.Fatalf("草稿箱不该再显示已移走的邮件，实际 %d", draftAfter)
	}
}