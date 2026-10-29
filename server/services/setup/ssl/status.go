package ssl

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/Jinnrry/pmail/config"
	log "github.com/sirupsen/logrus"
)

// CertState 是签发过程的快照，前端轮询这个结构拿进度。
//
// state 取值：
//   idle        还没开始
//   running     正在联系证书机构 / 等 DNS 生效
//   need_txt    DNS 挑战已算出记录，等用户去域名服务商那边添加
//   ok          签发成功
//   ok_fallback 签发失败，但用自签证书兜底，安装可以继续
//   failed      失败且没有可用证书
type CertState struct {
	State   string     `json:"state"`
	Records []*DNSItem `json:"records"`
	Error   string     `json:"error"`
}

var (
	certMu     sync.Mutex
	certStatus = CertState{State: "idle"}
)

func setCertStatus(state, errMsg string) {
	certMu.Lock()
	defer certMu.Unlock()
	certStatus.State = state
	certStatus.Error = errMsg
}

// GetCertState 返回当前状态；DNS 挑战进行中时顺带把要添加的 TXT 记录带出去。
func GetCertState() CertState {
	certMu.Lock()
	snapshot := certStatus
	certMu.Unlock()

	if snapshot.State == "running" {
		records := GetDnsChallengeInstance().GetDNSSettings(nil)
		if len(records) > 0 {
			snapshot.State = "need_txt"
			snapshot.Records = records
		}
	}
	return snapshot
}

// StartGenSSL 异步签发证书，立刻返回。
// 失败时会尝试用自签证书兜底，保证安装流程能收尾。
func StartGenSSL(update bool) CertState {
	certMu.Lock()
	if certStatus.State == "running" || certStatus.State == "need_txt" {
		current := certStatus
		certMu.Unlock()
		return current
	}
	certStatus = CertState{State: "running"}
	certMu.Unlock()

	go func() {
		log.Infof("ssl: start generating certificate (update=%v)", update)
		if err := GenSSL(update); err != nil {
			log.Errorf("ssl: generate failed: %v", err)
			cfg, cfgErr := config.ReadConfig()
			if cfgErr == nil {
				if fallbackErr := ensureSelfSigned(cfg); fallbackErr == nil {
					log.Warnf("ssl: fallback to self-signed certificate")
					setCertStatus("ok_fallback", err.Error())
					return
				}
			}
			setCertStatus("failed", err.Error())
			return
		}
		log.Infof("ssl: certificate ready")
		setCertStatus("ok", "")
	}()

	return GetCertState()
}

// ensureSelfSigned 在 config/ssl 下没有可用证书时生成一张自签证书。
// 这样即使签发失败，SMTP/IMAP 的 TLS 也有证书可用，安装不会被卡死。
func ensureSelfSigned(cfg *config.Config) error {
	if hasCertificate(cfg.SSLPrivateKeyPath, cfg.SSLPublicKeyPath) {
		return nil
	}

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return err
	}

	hosts := []string{"localhost", "pmail.local"}
	if cfg.Domain != "" {
		hosts = append(hosts, cfg.Domain)
	}
	if cfg.WebDomain != "" {
		hosts = append(hosts, cfg.WebDomain)
	}

	tmpl := x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: "pmail.local", Organization: []string{"PMail"}},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(10, 0, 0),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
		DNSNames:              hosts,
	}
	for _, host := range hosts {
		if ip := net.ParseIP(host); ip != nil {
			tmpl.IPAddresses = append(tmpl.IPAddresses, ip)
		}
	}

	der, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &key.PublicKey, key)
	if err != nil {
		return err
	}

	keyPem := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	crtPem := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})

	if err := writeFile(cfg.SSLPrivateKeyPath, keyPem, 0o600); err != nil {
		return err
	}
	return writeFile(cfg.SSLPublicKeyPath, crtPem, 0o644)
}

func hasCertificate(keyPath, crtPath string) bool {
	key, errKey := os.ReadFile(keyPath)
	crt, errCrt := os.ReadFile(crtPath)
	return errKey == nil && errCrt == nil && len(key) > 0 && len(crt) > 0
}

func writeFile(path string, data []byte, mode os.FileMode) error {
	if dir := strings.TrimSuffix(path, "/"+lastSegment(path)); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	return os.WriteFile(path, data, mode)
}

func lastSegment(path string) string {
	parts := strings.Split(path, "/")
	return parts[len(parts)-1]
}

// HasCertificate 判断 config/ssl 下是否已经有可用的证书文件
func HasCertificate() bool {
	cfg, err := config.ReadConfig()
	if err != nil {
		return false
	}
	return hasCertificate(cfg.SSLPrivateKeyPath, cfg.SSLPublicKeyPath)
}

// EnsureSelfSigned 没有证书时生成一张自签的，保证 SMTP/IMAP 的 TLS 一定能起来
func EnsureSelfSigned() error {
	cfg, err := config.ReadConfig()
	if err != nil {
		return err
	}
	return ensureSelfSigned(cfg)
}
