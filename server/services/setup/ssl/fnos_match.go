package ssl

import (
	"crypto/tls"
	"crypto/x509"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Jinnrry/pmail/config"
)

// CertCandidate 是飞牛证书目录里的一个候选证书，用于「按域名挑证书」。
type CertCandidate struct {
	Domain  string   `json:"domain"`  // 证书 CN
	Covers  []string `json:"covers"`  // 证书覆盖的域名（SAN + CN）
	Expire  string   `json:"expire"`  // 到期日
	Dir     string   `json:"dir"`     // 来源目录
	Matched bool     `json:"matched"` // 是否覆盖 PMail 自己配置的域名
	Score   int      `json:"score"`   // 匹配得分，0 = 不覆盖

	keyPEM []byte
	crtPEM []byte
	leaf   *x509.Certificate
}

// Public 返回可以安全回给前端的字段（去掉 PEM）
func (c *CertCandidate) Public() CertCandidate {
	return CertCandidate{
		Domain:  c.Domain,
		Covers:  c.Covers,
		Expire:  c.Expire,
		Dir:     c.Dir,
		Matched: c.Matched,
		Score:   c.Score,
	}
}

// normalizeHost 统一小写、去空白、去结尾的点
func normalizeHost(host string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
}

// hostCovered 判断一组证书名是否覆盖 host。
//
// 支持一级通配符：*.example.com 覆盖 mail.example.com，
// 但**不覆盖**裸域 example.com，也不覆盖 a.b.example.com（证书规范如此）。
func hostCovered(names []string, host string) bool {
	host = normalizeHost(host)
	if host == "" {
		return false
	}
	for _, raw := range names {
		name := normalizeHost(raw)
		if name == "" {
			continue
		}
		if name == host {
			return true
		}
		if strings.HasPrefix(name, "*.") {
			suffix := name[1:] // ".example.com"
			if !strings.HasSuffix(host, suffix) {
				continue
			}
			prefix := strings.TrimSuffix(host, suffix)
			if prefix != "" && !strings.Contains(prefix, ".") {
				return true
			}
		}
	}
	return false
}

// certNames 返回证书覆盖的名字（CN + SAN）
func certNames(leaf *x509.Certificate) []string {
	out := make([]string, 0, len(leaf.DNSNames)+1)
	if leaf.Subject.CommonName != "" {
		out = append(out, leaf.Subject.CommonName)
	}
	out = append(out, leaf.DNSNames...)

	// 去重
	seen := map[string]bool{}
	uniq := out[:0]
	for _, name := range out {
		key := normalizeHost(name)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		uniq = append(uniq, name)
	}
	return uniq
}

// wantedDomain 是「PMail 想要的域名」及其权重
type wantedDomain struct {
	host   string
	weight int
}

// wantDomains 按重要程度排出要匹配的域名：Web 域名 > 主域名 > 附加域名
func wantDomains(cfg *config.Config) []wantedDomain {
	out := make([]wantedDomain, 0, len(cfg.Domains)+2)
	seen := map[string]bool{}

	add := func(host string, weight int) {
		host = normalizeHost(host)
		if host == "" || seen[host] {
			return
		}
		seen[host] = true
		out = append(out, wantedDomain{host: host, weight: weight})
	}

	add(cfg.WebDomain, 100)
	add(cfg.Domain, 80)
	for _, domain := range cfg.Domains {
		add(domain, 60)
	}
	return out
}

// scoreCert 给候选证书打分：取「覆盖的最高权重」，再给覆盖邮件协议主机名的加分。
// 0 分表示这张证书不覆盖 PMail 的任何域名，不能用。
func scoreCert(leaf *x509.Certificate, wants []wantedDomain) int {
	names := certNames(leaf)

	best := 0
	for _, want := range wants {
		if hostCovered(names, want.host) && want.weight > best {
			best = want.weight
		}
	}
	if best == 0 {
		return 0
	}

	// 顺带覆盖 smtp./imap./pop. 的话更省心（+5，不改变是否可用的判断）
	for _, want := range wants {
		if want.weight < 80 {
			continue
		}
		for _, prefix := range []string{"smtp.", "imap.", "pop.", "mail."} {
			if hostCovered(names, prefix+want.host) {
				best += 5
				break
			}
		}
		break
	}
	return best
}

// collectCandidates 把飞牛证书目录里所有能配对的证书收集起来并打分。
// 顺序：得分高的在前；同分按目录新旧（collectCertDirs 已经是新→旧）。
func collectCandidates(cfg *config.Config) ([]*CertCandidate, string) {
	if _, err := os.Stat(fnosCertRoot); err != nil {
		return nil, "读不到飞牛证书目录：" + fnosCertRoot
	}

	dirs := collectCertDirs(fnosCertRoot, 3)
	if len(dirs) == 0 {
		return nil, "飞牛证书目录里还没有任何证书：" + fnosCertRoot
	}

	wants := wantDomains(cfg)
	var out []*CertCandidate

	for _, dir := range dirs {
		for _, pair := range candidatePairs(dir) {
			keyPEM, crtPEM := pair[0], pair[1]
			if _, err := tls.X509KeyPair(crtPEM, keyPEM); err != nil {
				continue // 私钥证书配不上对，跳过
			}
			leaf, err := parseLeaf(crtPEM)
			if err != nil {
				continue
			}
			score := scoreCert(leaf, wants)
			out = append(out, &CertCandidate{
				Domain:  leaf.Subject.CommonName,
				Covers:  certNames(leaf),
				Expire:  leaf.NotAfter.Format("2006-01-02"),
				Dir:     dir,
				Matched: score > 0,
				Score:   score,
				keyPEM:  keyPEM,
				crtPEM:  crtPEM,
				leaf:    leaf,
			})
		}
	}

	if len(out) == 0 {
		return nil, "飞牛证书目录里有 " + itoa(len(dirs)) + " 个子目录，但没有可用的私钥与证书配对"
	}

	// 得分高的优先；sort.SliceStable 保证同分时保留「新→旧」顺序
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out, ""
}

// pickBest 从候选里挑出该用的那一张。
//
// 规则（宽松策略）：只要覆盖 Web 域名 / 主域名 / 任一附加域名就用；
// 一张都不覆盖时返回 nil，并带上候选列表让界面提示用户。
// 例外：域名还没配置（安装到证书步骤之前就点了加载）且只有一张证书时，直接用那一张。
func pickBest(cands []*CertCandidate, wants []wantedDomain) *CertCandidate {
	for _, cand := range cands {
		if cand.Score > 0 {
			return cand
		}
	}
	if len(wants) == 0 && len(cands) == 1 {
		return cands[0]
	}
	return nil
}

// publicList 把候选转成可回给前端的形式
func publicList(cands []*CertCandidate) []CertCandidate {
	out := make([]CertCandidate, 0, len(cands))
	for _, cand := range cands {
		out = append(out, cand.Public())
	}
	return out
}

// noMatchMessage 生成「没有匹配证书」时的提示，带上飞牛里现有证书的清单
func noMatchMessage(wants []wantedDomain, cands []*CertCandidate) string {
	var wantNames []string
	for _, want := range wants {
		wantNames = append(wantNames, want.host)
	}

	var b strings.Builder
	b.WriteString("飞牛里没有覆盖 ")
	if len(wantNames) == 0 {
		b.WriteString("当前邮箱域名")
	} else {
		b.WriteString(strings.Join(wantNames, " / "))
	}
	b.WriteString(" 的证书，已拒绝安装（避免装上不匹配的域名）")
	if len(cands) > 0 {
		b.WriteString("。现有证书：")
		for i, cand := range cands {
			if i > 0 {
				b.WriteString("；")
			}
			b.WriteString(cand.Domain)
			if len(cand.Covers) > 1 {
				b.WriteString("（覆盖 ")
				b.WriteString(strings.Join(cand.Covers, ", "))
				b.WriteString("）")
			}
			b.WriteString("，到期 ")
			b.WriteString(cand.Expire)
		}
	}
	b.WriteString("。可以改用「粘贴自有证书」，或先在飞牛里为这个域名申请证书。")
	return b.String()
}

// itoa 小工具，避免为了一个数字引入 fmt
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

// candidatePairFiles 仅用于测试/调试时打印目录内容
func candidatePairFiles(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			out = append(out, filepath.Join(dir, entry.Name()))
		}
	}
	return out
}
