package res_init

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/services/setup"
	log "github.com/sirupsen/logrus"
)

// migrateMailDomain 修一次历史遗留的「邮箱域名填成主机名」问题。
//
// 场景：早期安装向导的输入框叫「SMTP 域名地址」，很容易填成 smtp.example.com，
// 于是 config.Domain 与已有账号（xxx@smtp.example.com）、DNS 的 MX 全跟着错。
// 现在向导会归一化，但已经写进去的配置和账号需要一次性修正。
//
// 安全性：
//   - 幂等：域名本来就没前缀时什么都不做
//   - 改前把 config.json 与数据库各备份一份（.bak-时间戳）
//   - 只改 domain/domains 与 user.account，不动历史邮件的收件人/发件人
func migrateMailDomain() {
	cfg, err := config.ReadConfig()
	if err != nil {
		log.Errorf("migrate: read config failed: %v", err)
		return
	}

	oldDomain := strings.TrimSpace(cfg.Domain)
	newDomain := setup.NormalizeMailDomain(oldDomain)

	domainsChanged := false
	newDomains := make([]string, 0, len(cfg.Domains))
	for _, item := range cfg.Domains {
		normalized := setup.NormalizeMailDomain(item)
		if normalized != item {
			domainsChanged = true
		}
		if normalized == "" || containsString(newDomains, normalized) {
			continue
		}
		newDomains = append(newDomains, normalized)
	}

	if newDomain == oldDomain && !domainsChanged {
		return
	}

	log.Warnf("migrate: mail domain looks like a hostname: %q -> %q", oldDomain, newDomain)

	// 1) 备份配置与数据库
	backupConfig()
	backupDatabase(cfg)

	// 2) 改配置
	cfg.Domain = newDomain
	cfg.Domains = newDomains
	if !containsString(cfg.Domains, newDomain) && newDomain != "" {
		cfg.Domains = append(cfg.Domains, newDomain)
	}
	if err := config.WriteConfig(cfg); err != nil {
		log.Errorf("migrate: write config failed: %v", err)
		return
	}

	// 3) 改已有账号：xxx@smtp.example.com -> xxx@example.com
	if oldDomain != "" && newDomain != "" && db.Instance != nil {
		oldSuffix := "@" + oldDomain
		newSuffix := "@" + newDomain
		result, err := db.Instance.Exec(
			"UPDATE user SET account = replace(account, ?, ?) WHERE account LIKE ?",
			oldSuffix, newSuffix, "%"+oldSuffix,
		)
		if err != nil {
			log.Errorf("migrate: update accounts failed: %v", err)
		} else if affected, err := result.RowsAffected(); err == nil {
			log.Warnf("migrate: %d account(s) renamed %s -> %s", affected, oldSuffix, newSuffix)
		}
	}

	log.Infof("migrate: mail domain fixed, config/domains=%v", cfg.Domains)
}

func containsString(list []string, want string) bool {
	for _, item := range list {
		if item == want {
			return true
		}
	}
	return false
}

// backupConfig 把 config.json 复制一份
func backupConfig() {
	src := filepath.Join(config.ROOT_PATH, "config", "config.json")
	dst := src + ".bak-" + time.Now().Format("20060102-150405")
	if err := copyFile(src, dst); err != nil {
		log.Warnf("migrate: backup config failed: %v", err)
		return
	}
	log.Infof("migrate: config backed up to %s", dst)
}

// backupDatabase 把 sqlite 库复制一份（只处理 sqlite，其它类型跳过）
func backupDatabase(cfg *config.Config) {
	if cfg.DbType != config.DBTypeSQLite || cfg.DbDSN == "" {
		return
	}
	dst := cfg.DbDSN + ".bak-" + time.Now().Format("20060102-150405")
	if err := copyFile(cfg.DbDSN, dst); err != nil {
		log.Warnf("migrate: backup database failed: %v", err)
		return
	}
	log.Infof("migrate: database backed up to %s", dst)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
