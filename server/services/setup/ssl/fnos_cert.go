package ssl

import (
	"crypto/tls"
	"crypto/x509"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/Jinnrry/pmail/config"
)

// CertInfo 是「证书已就位」之后回给前端的摘要
type CertInfo struct {
	Found   bool   `json:"found"`
	Source  string `json:"source"`
	Domain  string `json:"domain"`
	Expire  string `json:"expire"`
	Message string `json:"message"`
}

const fnosCertRoot = "/usr/trim/var/trim_connect/ssls"

// LoadFnOsCert 把飞牛自己管理的证书同步到 PMail 的 config/ssl 下。
//
// 飞牛的目录结构随版本变过（ssls/<域名>/<时间戳>/ 或 ssls/<时间戳>/），
// 文件名也不固定（privkey.pem / fullchain.pem / *.key / *.crt ...）。
// 所以这里不猜文件名：把候选目录按时间倒序扫一遍，按「内容里有 PRIVATE KEY /
// CERTIFICATE」来挑，最后用 tls.X509KeyPair 验证能不能配对。
func LoadFnOsCert() CertInfo {
	cfg, err := config.ReadConfig()
	if err != nil {
		return CertInfo{Message: err.Error()}
	}

	if _, err := os.Stat(fnosCertRoot); err != nil {
		return CertInfo{Message: "读不到飞牛证书目录：" + fnosCertRoot + "（" + err.Error() + "）"}
	}

	dirs := collectCertDirs(fnosCertRoot, 3)
	if len(dirs) == 0 {
		return CertInfo{Message: "飞牛证书目录里还没有任何证书：" + fnosCertRoot}
	}

	tried := 0
	for _, dir := range dirs {
		for _, pair := range candidatePairs(dir) {
			tried++
			if info := installPEM(cfg, pair[0], pair[1], "fnos:"+dir); info.Found {
				return info
			}
		}
	}

	if tried == 0 {
		return CertInfo{Message: "飞牛证书目录里有 " + strconv.Itoa(len(dirs)) + " 个子目录，但没找到可配对的私钥与证书"}
	}
	return CertInfo{Message: "飞牛证书目录里找到 " + strconv.Itoa(tried) + " 组文件，但私钥与证书都配不上对"}
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

// collectCertDirs 收集 root 下 1~maxDepth 层的目录，按修改时间倒序（新的在前）
func collectCertDirs(root string, maxDepth int) []string {
	type entry struct {
		dir   string
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
			found = append(found, entry{dir: full, mtime: mtime})
			walk(full, depth+1)
		}
	}
	walk(root, 1)

	sort.Slice(found, func(i, j int) bool { return found[i].mtime > found[j].mtime })
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
