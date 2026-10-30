package res_init

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/models"
)

// 造一个「域名被填成 smtp.example.com」的实例，验证迁移把配置和账号都改对，并且留了备份。
func TestMigrateMailDomain(t *testing.T) {
	oldRoot := config.ROOT_PATH
	t.Cleanup(func() { config.ROOT_PATH = oldRoot })

	root := t.TempDir()
	config.ROOT_PATH = root
	if err := os.MkdirAll(filepath.Join(root, "config"), 0o755); err != nil {
		t.Fatalf("mkdir config: %v", err)
	}

	dbPath := filepath.Join(root, "config", "pmail.db")
	cfg := config.Config{
		Domain:            "smtp.example.com",
		Domains:           []string{"smtp.example.com"},
		WebDomain:         "mail.example.com",
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
	// Windows 上 sqlite 句柄不关会锁住临时目录：defer 比 t.Cleanup(TempDir) 先执行
	defer func() {
		if db.Instance != nil {
			_ = db.Instance.Close()
			db.Instance = nil
		}
	}()
	if _, err := db.Instance.Insert(&models.User{
		Account:  "notice@smtp.example.com",
		Name:     "通知",
		Password: "x",
		IsAdmin:  1,
	}); err != nil {
		t.Fatalf("insert user: %v", err)
	}

	migrateMailDomain()

	after, err := config.ReadConfig()
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if after.Domain != "example.com" {
		t.Fatalf("domain = %q, want example.com", after.Domain)
	}
	for _, item := range after.Domains {
		if item == "smtp.example.com" {
			t.Fatalf("domains still contains the wrong value: %v", after.Domains)
		}
	}

	var users []models.User
	if err := db.Instance.Find(&users); err != nil {
		t.Fatalf("query users: %v", err)
	}
	if len(users) != 1 || users[0].Account != "notice@example.com" {
		t.Fatalf("account not migrated: %+v", users)
	}

	// 备份文件存在
	matches, _ := filepath.Glob(filepath.Join(root, "config", "config.json.bak-*"))
	if len(matches) == 0 {
		t.Fatal("expected a config backup file")
	}
	dbBackups, _ := filepath.Glob(dbPath + ".bak-*")
	if len(dbBackups) == 0 {
		t.Fatal("expected a database backup file")
	}

	// 幂等：再跑一次不应该再改动
	migrateMailDomain()
	again, _ := config.ReadConfig()
	if again.Domain != "example.com" {
		t.Fatalf("second run changed domain to %q", again.Domain)
	}
}
