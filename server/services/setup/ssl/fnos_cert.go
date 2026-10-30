package ssl

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/Jinnrry/pmail/config"
	log "github.com/sirupsen/logrus"
)

// CertInfo 是「证书已就位」之后回给前端的摘要
type CertInfo struct {
	Found   bool   `json:"found"`
	Source  string `json:"source"`
	Domain  string `json:"domain"`
	Expire  string `json:"expire"`
	Message string `json:"message"`
	// 飞牛里发现的全部候选证书（按匹配度排序），没匹配上时给用户看清单
	Candidates []CertCandidate `json:"candidates,omitempty"`
}

// fnosCertRoot 是飞牛自己管证书的目录。做成变量是为了让测试能指到临时目录。
var fnosCertRoot = "/usr/trim/var/trim_connect/ssls"

// FnOsCertRootExists 判断飞牛证书目录在不在（cron 用它决定要不要跑同步）
func FnOsCertRootExists() bool {
	_, err := os.Stat(fnosCertRoot)
	return err == nil
}

// CertSummary 读当前 config/ssl 里的证书，返回域名（CN）与到期时间。
// 设置页的「证书状态」卡片用它；证书缺失或解析失败时返回 error。
func CertSummary() (string, time.Time, error) {
	cfg, err := config.ReadConfig()
	if err != nil {
		return "", time.Time{}, err
	}
	crtPEM, err := os.ReadFile(cfg.SSLPublicKeyPath)
	if err != nil {
		return "", time.Time{}, err
	}
	leaf, err := parseLeaf(crtPEM)
	if err != nil {
		return "", time.Time{}, err
	}
	return leaf.Subject.CommonName, leaf.NotAfter, nil
}

// LoadFnOsCert 把飞牛自己管理的证书同步到 PMail 的 config/ssl 下。
//
// 飞牛的目录结构随版本变过（ssls/<域名>/<时间戳>/ 或 ssls/<时间戳>/），
// 文件名也不固定（privkey.pem / fullchain.pem / *.key / *.crt ...），所以不猜文件名：
// 按内容挑出所有能配对的证书，再**按域名匹配**——只装覆盖 PMail 自己域名的那一张。
// 一张都不覆盖时拒绝安装，并把飞牛里现有证书的清单回给前端。
func LoadFnOsCert() CertInfo {
	cfg, err := config.ReadConfig()
	if err != nil {
		return CertInfo{Message: err.Error()}
	}

	cands, msg := collectCandidates(cfg)
	if cands == nil {
		return CertInfo{Message: msg}
	}

	wants := wantDomains(cfg)
	best := pickBest(cands, wants)
	if best == nil {
		return CertInfo{
			Message:    noMatchMessage(wants, cands),
			Candidates: publicList(cands),
		}
	}

	info := installPEM(cfg, best.keyPEM, best.crtPEM, "fnos:"+best.Dir)
	info.Candidates = publicList(cands)
	return info
}

// SaveCertPEM 接收前端粘贴的 PEM，写入 config/ssl 并校验能否配对
func SaveCertPEM(keyPEM, crtPEM []byte) CertInfo {
	cfg, err := config.ReadConfig()
	if err != nil {
		return CertInfo{Message: err.Error()}
	}
	if len(keyPEM) == 0 || len(crtPEM) == 0 {
		return CertInfo{Message: "私钥和证书内容都不能为空"}
	}
	return installPEM(cfg, keyPEM, crtPEM, "upload")
}

// SyncFnOsCert 由 cron 调用：飞牛证书目录里有新证书就同步过来。
// 返回 (本轮是否发生变更, 摘要)。内容没变时什么都不写、不触发重启。
// SyncFnOsCert 由 cron / 设置页调用：飞牛证书目录里有新证书就同步过来。
//
// force=false（cron 自动跑）：只在 sslSource=fnos 时覆盖；sslSource 为空（老版本配置）
// 时只在内容已经一致的情况下认领来源，绝不擅自覆盖来路不明的证书。
// force=true（用户在设置页点「立即重新加载」）：明确要求以飞牛证书为准。
//
// 返回 (本轮是否发生变更, 摘要)。
func SyncFnOsCert(force bool) (bool, CertInfo) {
	return syncIfChanged(force)
}

// syncIfChanged 比较「按域名匹配到的那张飞牛证书」与本地 config/ssl 的内容，不同才覆盖。
func syncIfChanged(force bool) (bool, CertInfo) {
	cfg, err := config.ReadConfig()
	if err != nil {
		return false, CertInfo{Message: err.Error()}
	}

	source := strings.TrimSpace(cfg.SSLSource)
	if source == "upload" && !force {
		return false, CertInfo{Message: "当前证书是手动粘贴的，跳过自动同步"}
	}

	cands, msg := collectCandidates(cfg)
	if cands == nil {
		return false, CertInfo{Message: msg}
	}

	wants := wantDomains(cfg)
	best := pickBest(cands, wants)
	if best == nil {
		// 一张都不覆盖：不装、不动本地证书，把候选清单回给界面
		return false, CertInfo{
			Message:    noMatchMessage(wants, cands),
			Candidates: publicList(cands),
		}
	}

	localKey, errKey := os.ReadFile(cfg.SSLPrivateKeyPath)
	localCrt, errCrt := os.ReadFile(cfg.SSLPublicKeyPath)
	if errKey == nil && errCrt == nil &&
		bytes.Equal(localKey, best.keyPEM) && bytes.Equal(localCrt, best.crtPEM) {
		// 内容一致：顺便把老配置缺失的来源补上，下次续期就能自动跟
		if source != "fnos" {
			adoptFnOsSource(cfg)
			log.Infof("local certificate matches fnOS, sslSource set to fnos (%s)", best.Dir)
		}
		return false, CertInfo{
			Found:      true,
			Source:     "fnos:" + best.Dir,
			Domain:     best.Domain,
			Expire:     best.Expire,
			Candidates: publicList(cands),
		}
	}

	// 内容不同。来源不明时不动手，避免把用户自己的证书顶掉
	if source != "fnos" && !force {
		info := CertInfo{
			Message:    "本地证书与飞牛证书不一致，且来源未知，已跳过（可在设置页手动重新加载）",
			Candidates: publicList(cands),
		}
		return false, info
	}

	info := installPEM(cfg, best.keyPEM, best.crtPEM, "fnos:"+best.Dir)
	if info.Found {
		log.Infof("fnos cert synced from %s: domain=%s expire=%s", best.Dir, info.Domain, info.Expire)
	}
	info.Candidates = publicList(cands)
	return info.Found, info
}

// adoptFnOsSource 把来源标成 fnos 并落盘（老版本配置升级兼容用）
func adoptFnOsSource(cfg *config.Config) {
	cfg.SSLSource = "fnos"
	if err := config.WriteConfig(cfg); err != nil {
		log.Warnf("failed to persist sslSource: %v", err)
	}
}

// parseLeaf 解析证书 PEM 的第一张（叶子证书），只需要看域名和到期日
func parseLeaf(crtPEM []byte) (*x509.Certificate, error) {
	rest := crtPEM
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return nil, errors.New("no certificate PEM block")
		}
		if block.Type != "CERTIFICATE" {
			continue
		}
		return x509.ParseCertificate(block.Bytes)
	}
}

func installPEM(cfg *config.Config, keyPEM, crtPEM []byte, source string) CertInfo {
	pair, err := tls.X509KeyPair(crtPEM, keyPEM)
	if err != nil {
		return CertInfo{Message: "证书和私钥不匹配：" + err.Error()}
	}
	cert, err := x509.ParseCertificate(pair.Certificate[0])
	if err != nil {
		return CertInfo{Message: "证书解析失败：" + err.Error()}
	}

	if err := os.MkdirAll(filepath.Dir(cfg.SSLPrivateKeyPath), 0o755); err != nil {
		return CertInfo{Message: err.Error()}
	}
	if err := os.WriteFile(cfg.SSLPrivateKeyPath, keyPEM, 0o600); err != nil {
		return CertInfo{Message: err.Error()}
	}
	if err := os.WriteFile(cfg.SSLPublicKeyPath, crtPEM, 0o644); err != nil {
		return CertInfo{Message: err.Error()}
	}

	// 证书落地后把配置钉成「用户证书」模式：
	// 否则 sslType 还停在自动签发，主服务起来会又跑一遍 ACME 把证书覆盖掉。
	cfg.SSLType = config.SSLTypeUser
	cfg.HttpsEnabled = 2
	if strings.HasPrefix(source, "fnos") {
		cfg.SSLSource = "fnos"
	} else if source == "upload" {
		cfg.SSLSource = "upload"
	}
	if err := config.WriteConfig(cfg); err != nil {
		return CertInfo{Message: "证书已写入，但更新配置失败：" + err.Error()}
	}

	return CertInfo{
		Found:  true,
		Source: source,
		Domain: cert.Subject.CommonName,
		Expire: cert.NotAfter.Format("2006-01-02"),
	}
}

// collectCertDirs 收集 root 下 1~maxDepth 层的目录，按「新」到「旧」排序。
//
// 飞牛的续期目录名就是时间戳，所以先比 mtime，mtime 相同（同一秒内建的、
// 或文件系统精度不够）再按目录名倒序兜底，避免顺序不稳定导致同步挑到旧证书。
func collectCertDirs(root string, maxDepth int) []string {
	type entry struct {
		dir   string
		name  string
		mtime int64
	}
	var found []entry

	var walk func(dir string, depth int)
	walk = func(dir string, depth int) {
		if depth > maxDepth {
			return
		}
		items, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, item := range items {
			if !item.IsDir() {
				continue
			}
			full := filepath.Join(dir, item.Name())
			info, err := item.Info()
			mtime := int64(0)
			if err == nil {
				mtime = info.ModTime().Unix()
			}
			found = append(found, entry{dir: full, name: item.Name(), mtime: mtime})
			walk(full, depth+1)
		}
	}
	walk(root, 1)

	sort.Slice(found, func(i, j int) bool {
		if found[i].mtime != found[j].mtime {
			return found[i].mtime > found[j].mtime
		}
		return found[i].name > found[j].name
	})
	dirs := make([]string, 0, len(found))
	for _, item := range found {
		dirs = append(dirs, item.dir)
	}
	return dirs
}

// candidatePairs 在同一个目录里按内容挑出「能配对的私钥+证书」组合。
// 顺序上先试带 chain 的证书（文件名含 fullchain / chain 的排前面）。
func candidatePairs(dir string) [][2][]byte {
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	var keys [][]byte
	var crts [][]byte
	chainFirst := func(name string) bool {
		lower := strings.ToLower(name)
		return strings.Contains(lower, "fullchain") || strings.Contains(lower, "chain")
	}

	sort.SliceStable(files, func(i, j int) bool {
		// 带中间证书的排前面
		return !chainFirst(files[i].Name()) && chainFirst(files[j].Name())
	})

	for _, file := range files {
		if file.IsDir() {
			continue
		}
		name := strings.ToLower(file.Name())
		if strings.HasSuffix(name, ".md") || strings.HasSuffix(name, ".txt") || strings.HasSuffix(name, ".csr") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, file.Name()))
		if err != nil || len(data) == 0 {
			continue
		}
		text := string(data)
		switch {
		case strings.Contains(text, "PRIVATE KEY"):
			keys = append(keys, data)
		case strings.Contains(text, "CERTIFICATE"):
			crts = append(crts, data)
		}
	}

	var pairs [][2][]byte
	for _, key := range keys {
		for _, crt := range crts {
			if _, err := tls.X509KeyPair(crt, key); err == nil {
				pairs = append(pairs, [2][]byte{key, crt})
			}
		}
	}
	return pairs
}
