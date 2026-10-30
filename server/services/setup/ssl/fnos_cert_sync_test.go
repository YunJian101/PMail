package ssl

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Jinnrry/pmail/config"
)

// makePair 生成一对自签证书，返回 (私钥 PEM, 证书 PEM)
func makePair(t *testing.T, cn string) ([]byte, []byte) {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("gen key: %v", err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		t.Fatalf("gen serial: %v", err)
	}
	tmpl := x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: cn},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(1, 0, 0),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create cert: %v", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	crtPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	return keyPEM, crtPEM
}

// setupSandbox 把 config.ROOT_PATH 与 fnosCertRoot 都指到临时目录
func setupSandbox(t *testing.T) (root string, fnosDir string) {
	t.Helper()

	oldRoot := config.ROOT_PATH
	oldFnOs := fnosCertRoot
	t.Cleanup(func() {
		config.ROOT_PATH = oldRoot
		fnosCertRoot = oldFnOs
	})

	root = t.TempDir()
	config.ROOT_PATH = root

	if err := os.MkdirAll(filepath.Join(root, "config", "ssl"), 0o755); err != nil {
		t.Fatalf("mkdir config: %v", err)
	}
	cfg := config.Config{
		Domain:            "example.test",
		WebDomain:         "mail.example.test",
		DbType:            config.DBTypeSQLite,
		DbDSN:             filepath.Join(root, "config", "pmail.db"),
		SSLType:           config.SSLTypeUser,
		SSLSource:         "fnos", // 模拟「安装时从飞牛加载」的实例
		SSLPrivateKeyPath: filepath.Join(root, "config", "ssl", "private.key"),
		SSLPublicKeyPath:  filepath.Join(root, "config", "ssl", "public.crt"),
		HttpsEnabled:      2,
		IsInit:            true,
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal cfg: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "config", "config.json"), raw, 0o644); err != nil {
		t.Fatalf("write cfg: %v", err)
	}

	fnosDir = filepath.Join(t.TempDir(), "ssls")
	fnosCertRoot = fnosDir
	return root, fnosDir
}

// writeFnOsCert 在飞牛目录下造一套证书：ssls/<域名>/<时间戳>/{privkey.pem,fullchain.pem}
func writeFnOsCert(t *testing.T, fnosDir, domain, stamp, cn string) {
	t.Helper()

	dir := filepath.Join(fnosDir, domain, stamp)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir fnos cert dir: %v", err)
	}
	keyPEM, crtPEM := makePair(t, cn)
	if err := os.WriteFile(filepath.Join(dir, "privkey.pem"), keyPEM, 0o600); err != nil {
		t.Fatalf("write key: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "fullchain.pem"), crtPEM, 0o644); err != nil {
		t.Fatalf("write crt: %v", err)
	}
	// 顺便放一个中间证书，确认不会被误当成叶子证书
	_, issuerPEM := makePair(t, "issuer")
	_ = os.WriteFile(filepath.Join(dir, "issuer_certificate.crt"), issuerPEM, 0o644)
}

func TestSyncIfChanged_CopiesThenNoop(t *testing.T) {
	root, fnosDir := setupSandbox(t)
	writeFnOsCert(t, fnosDir, "example.test", "1700000000", "*.example.test")

	changed, info := syncIfChanged(false)
	if !changed {
		t.Fatalf("first sync should report changed, got %+v", info)
	}
	if !info.Found || info.Domain != "*.example.test" {
		t.Fatalf("unexpected info: %+v", info)
	}

	// 文件确实落地了
	key, err := os.ReadFile(filepath.Join(root, "config", "ssl", "private.key"))
	if err != nil || len(key) == 0 {
		t.Fatalf("private key not written: %v", err)
	}
	crt, err := os.ReadFile(filepath.Join(root, "config", "ssl", "public.crt"))
	if err != nil || len(crt) == 0 {
		t.Fatalf("cert not written: %v", err)
	}

	// 来源被钉成 fnos，供 cron / 设置页判断
	cfg, err := config.ReadConfig()
	if err != nil {
		t.Fatalf("read cfg: %v", err)
	}
	if cfg.SSLSource != "fnos" {
		t.Fatalf("sslSource = %q, want fnos", cfg.SSLSource)
	}
	if cfg.SSLType != config.SSLTypeUser {
		t.Fatalf("sslType = %q, want user cert", cfg.SSLType)
	}

	// 再跑一次：内容没变，不应该报变更
	changed, info = syncIfChanged(false)
	if changed {
		t.Fatalf("second sync should be a no-op, got %+v", info)
	}
	if !info.Found {
		t.Fatalf("second sync should still find a cert: %+v", info)
	}
}

func TestSyncIfChanged_PicksUpRenewal(t *testing.T) {
	root, fnosDir := setupSandbox(t)
	writeFnOsCert(t, fnosDir, "example.test", "1700000000", "old.example.test")

	if changed, _ := syncIfChanged(false); !changed {
		t.Fatal("initial sync should change")
	}
	firstKey, _ := os.ReadFile(filepath.Join(root, "config", "ssl", "private.key"))

	// 模拟飞牛续期：新的时间戳目录（更新）
	time.Sleep(10 * time.Millisecond)
	writeFnOsCert(t, fnosDir, "example.test", "1800000000", "new.example.test")

	changed, info := syncIfChanged(false)
	if !changed {
		t.Fatalf("renewal should be detected, got %+v", info)
	}
	if info.Domain != "new.example.test" {
		t.Fatalf("domain = %q, want new.example.test", info.Domain)
	}
	secondKey, _ := os.ReadFile(filepath.Join(root, "config", "ssl", "private.key"))
	if string(firstKey) == string(secondKey) {
		t.Fatal("private key should have been replaced by the renewed one")
	}
}

func TestSyncIfChanged_MissingDir(t *testing.T) {
	setupSandbox(t)
	fnosCertRoot = filepath.Join(os.TempDir(), "definitely-not-there-fnos-ssls")

	changed, info := syncIfChanged(false)
	if changed {
		t.Fatal("should not report change when the fnOS dir is missing")
	}
	if info.Message == "" {
		t.Fatal("expected a human-readable reason when the dir is missing")
	}
	if FnOsCertRootExists() {
		t.Fatal("FnOsCertRootExists should be false for a missing dir")
	}
}

func TestSyncIfChanged_IgnoresBrokenPair(t *testing.T) {
	_, fnosDir := setupSandbox(t)

	// 私钥和证书不配对：不应该被采用
	dir := filepath.Join(fnosDir, "example.test", "1700000000")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	keyA, _ := makePair(t, "a.example.test")
	_, crtB := makePair(t, "b.example.test")
	_ = os.WriteFile(filepath.Join(dir, "privkey.pem"), keyA, 0o600)
	_ = os.WriteFile(filepath.Join(dir, "fullchain.pem"), crtB, 0o644)

	changed, info := syncIfChanged(false)
	if changed {
		t.Fatalf("broken pair must not be installed, got %+v", info)
	}
	if info.Message == "" {
		t.Fatal("expected a reason when no valid pair exists")
	}
}

// setSource 改写沙箱里的 sslSource，用来模拟不同的来源状态
func setSource(t *testing.T, root, source string) {
	t.Helper()

	cfg, err := config.ReadConfig()
	if err != nil {
		t.Fatalf("read cfg: %v", err)
	}
	cfg.SSLSource = source
	if err := config.WriteConfig(cfg); err != nil {
		t.Fatalf("write cfg: %v", err)
	}
}

// 手动粘贴的证书：cron 自动同步不能覆盖
func TestSyncIfChanged_SkipsUploadSource(t *testing.T) {
	root, fnosDir := setupSandbox(t)
	writeFnOsCert(t, fnosDir, "example.test", "1700000000", "fnos.example.test")

	// 本地先放一套「用户自己的」证书
	ownKey, ownCrt := makePair(t, "own.example.test")
	if err := os.WriteFile(filepath.Join(root, "config", "ssl", "private.key"), ownKey, 0o600); err != nil {
		t.Fatalf("write own key: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "config", "ssl", "public.crt"), ownCrt, 0o644); err != nil {
		t.Fatalf("write own crt: %v", err)
	}
	setSource(t, root, "upload")

	changed, info := syncIfChanged(false)
	if changed {
		t.Fatalf("upload source must not be overwritten by cron, got %+v", info)
	}
	if info.Message == "" {
		t.Fatal("expected a skip reason")
	}
	// 文件没被改
	got, _ := os.ReadFile(filepath.Join(root, "config", "ssl", "public.crt"))
	if string(got) != string(ownCrt) {
		t.Fatal("user certificate must stay untouched")
	}

	// 但用户在设置页强制重载时，以飞牛为准
	changed, info = syncIfChanged(true)
	if !changed {
		t.Fatalf("force reload should apply the fnOS cert, got %+v", info)
	}
}

// 老版本配置没有 sslSource：内容一致时认领为 fnos，之后才能自动跟随续期
func TestSyncIfChanged_AdoptsUnknownSourceWhenIdentical(t *testing.T) {
	root, fnosDir := setupSandbox(t)
	writeFnOsCert(t, fnosDir, "example.test", "1700000000", "*.example.test")
	setSource(t, root, "")

	// 第一次：来源未知 + 内容不同 -> 不动手
	changed, info := syncIfChanged(false)
	if changed {
		t.Fatalf("unknown source with different cert must not be overwritten, got %+v", info)
	}

	// 强制重载一次，让本地证书与飞牛一致
	if changed, info = syncIfChanged(true); !changed {
		t.Fatalf("force reload should install the fnOS cert, got %+v", info)
	}

	// 把来源清掉，模拟升级前的旧配置
	setSource(t, root, "")
	changed, info = syncIfChanged(false)
	if changed {
		t.Fatalf("identical cert should be a no-op, got %+v", info)
	}

	cfg, err := config.ReadConfig()
	if err != nil {
		t.Fatalf("read cfg: %v", err)
	}
	if cfg.SSLSource != "fnos" {
		t.Fatalf("sslSource should be adopted as fnos, got %q", cfg.SSLSource)
	}
}
