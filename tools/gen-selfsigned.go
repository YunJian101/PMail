//go:build ignore

// 生成自签证书，仅用于「先把服务跑起来」的临时场景：
//
//	go run tools/gen-selfsigned.go -out ./config/ssl -cn pmail.local
//
// 生成 private.key / public.crt，PMail 的证书步骤看到这两个文件已存在就会跳过 ACME。
package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"flag"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	out := flag.String("out", "./config/ssl", "输出目录")
	cn := flag.String("cn", "pmail.local", "证书 CN")
	hosts := flag.String("hosts", "localhost,pmail.local", "额外 DNS 名，逗号分隔")
	ips := flag.String("ips", "127.0.0.1", "额外 IP，逗号分隔")
	flag.Parse()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	must(err)

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	must(err)

	tmpl := x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: *cn, Organization: []string{"PMail"}},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(10, 0, 0),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	for _, host := range strings.Split(*hosts, ",") {
		if host = strings.TrimSpace(host); host != "" {
			tmpl.DNSNames = append(tmpl.DNSNames, host)
		}
	}
	for _, item := range strings.Split(*ips, ",") {
		if item = strings.TrimSpace(item); item != "" {
			if ip := net.ParseIP(item); ip != nil {
				tmpl.IPAddresses = append(tmpl.IPAddresses, ip)
			}
		}
	}

	der, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &key.PublicKey, key)
	must(err)

	must(os.MkdirAll(*out, 0o755))

	keyPem := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	crtPem := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})

	must(os.WriteFile(filepath.Join(*out, "private.key"), keyPem, 0o600))
	must(os.WriteFile(filepath.Join(*out, "public.crt"), crtPem, 0o644))

	fmt.Printf("写入 %s/private.key 与 %s/public.crt\n", *out, *out)
	fmt.Printf("CN=%s  DNS=%v  IP=%v  有效期 10 年\n", *cn, tmpl.DNSNames, tmpl.IPAddresses)
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
