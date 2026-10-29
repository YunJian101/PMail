package auth

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/utils/context"
	log "github.com/sirupsen/logrus"
	"os"
	"path/filepath"
	"strings"
)

// HasAuth 检查当前用户是否有某个邮件的auth
func HasAuth(ctx *context.Context, email *models.Email) bool {
	if ctx.IsAdmin {
		return true
	}
	var ue []models.UserEmail
	err := db.Instance.Table(&models.UserEmail{}).Where("email_id = ? and user_id = ?", email.Id, ctx.UserID).Find(&ue)
	if err != nil {
		log.Errorf("Error while checking user: %v", err)
		return false
	}

	return len(ue) != 0
}

// dkimDir 返回 DKIM 文件所在目录。
//
// 这里不能写死 "./config/dkim"：那是相对「进程当前目录」的，而 PMail 的数据目录
// 是 ROOT_PATH（可执行文件所在目录，或被 PMail_ROOT 覆盖）。两者不一致时，
// 这里生成的私钥会落在别处，parsemail 启动时按 ROOT_PATH 找不到就直接 panic。
func dkimDir() string {
	root := config.ROOT_PATH
	if root == "" {
		root = "./"
	}
	return filepath.Join(root, "config", "dkim")
}

func DkimGen() string {
	dir := dkimDir()
	_ = os.MkdirAll(dir, 0o744)
	privPath := filepath.Join(dir, "dkim.priv")
	pubPath := filepath.Join(dir, "dkim.public")

	privKeyStr, _ := os.ReadFile(privPath)
	publicKeyStr, _ := os.ReadFile(pubPath)
	if len(privKeyStr) > 0 && len(publicKeyStr) > 0 {
		return string(publicKeyStr)
	}

	var (
		privKey crypto.Signer
		err     error
	)

	privKey, err = rsa.GenerateKey(rand.Reader, 1024)

	if err != nil {
		log.Fatalf("Failed to generate key: %v", err)
	}

	privBytes, err := x509.MarshalPKCS8PrivateKey(privKey)
	if err != nil {
		log.Fatalf("Failed to marshal private key: %v", err)
	}

	f, err := os.OpenFile(privPath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		log.Fatalf("Failed to create key file: %v", err)
	}
	defer f.Close()

	privBlock := pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: privBytes,
	}
	if err := pem.Encode(f, &privBlock); err != nil {
		log.Fatalf("Failed to write key PEM block: %v", err)
	}
	if err := f.Close(); err != nil {
		log.Fatalf("Failed to close key file: %v", err)
	}

	var pubBytes []byte

	switch pubKey := privKey.Public().(type) {
	case *rsa.PublicKey:
		// RFC 6376 is inconsistent about whether RSA public keys should
		// be formatted as RSAPublicKey or SubjectPublicKeyInfo.
		// Erratum 3017 (https://www.rfc-editor.org/errata/eid3017)
		// proposes allowing both.  We use SubjectPublicKeyInfo for
		// consistency with other implementations including opendkim,
		// Gmail, and Fastmail.
		pubBytes, err = x509.MarshalPKIXPublicKey(pubKey)
		if err != nil {
			log.Fatalf("Failed to marshal public key: %v", err)
		}
	default:
		panic("unreachable")
	}

	params := []string{
		"v=DKIM1",
		"k=rsa",
		"p=" + base64.StdEncoding.EncodeToString(pubBytes),
	}

	publicKey := strings.Join(params, "; ")

	os.WriteFile(pubPath, []byte(publicKey), 0666)

	return publicKey
}
