package smtp_server

import (
	"crypto/tls"
	"time"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/listen/mailstatus"
	"github.com/emersion/go-smtp"
	log "github.com/sirupsen/logrus"
)

var instance *smtp.Server
var instanceTls *smtp.Server
var instanceTlsNew *smtp.Server

func StartWithTLSNew() {
	be := &Backend{}

	instanceTlsNew = smtp.NewServer(be)

	instanceTlsNew.Addr = config.Addr("SUBMISSION", 587)
	instanceTlsNew.Domain = config.Instance.Domain
	instanceTlsNew.ReadTimeout = 10 * time.Second
	instanceTlsNew.WriteTimeout = 10 * time.Second
	instanceTlsNew.MaxMessageBytes = 1024 * 1024 * 30
	instanceTlsNew.MaxRecipients = 50
	// force TLS for auth
	instanceTlsNew.AllowInsecureAuth = true
	// Load the certificate and key
	cer, err := tls.LoadX509KeyPair(config.Instance.SSLPublicKeyPath, config.Instance.SSLPrivateKeyPath)
	if err != nil {
		log.Errorf("smtp submission: load certificate failed: %v", err)
		mailstatus.Report("SMTP-SUBMISSION", config.Port("SUBMISSION", 587), err)
		return
	}
	// Configure the TLS support for STARTTLS
	instanceTlsNew.TLSConfig = &tls.Config{Certificates: []tls.Certificate{cer}}

	log.Println("Starting Smtp With STARTTLS Server Port:", instanceTlsNew.Addr)
	// 先登记为「监听中」：ListenAndServe 成功时会一直阻塞，写在后面永远不会执行
	mailstatus.Report("SMTP-SUBMISSION", config.Port("SUBMISSION", 587), nil)
	// 587端口使用STARTTLS（先明文连接，再升级TLS），而非隐式TLS
	if err := instanceTlsNew.ListenAndServe(); err != nil {
		// 端口被占用时不能杀掉进程，否则网页也打不开、没地方改端口
		log.Errorf("smtp submission: listen failed: %v", err)
		mailstatus.Report("SMTP-SUBMISSION", config.Port("SUBMISSION", 587), err)
		return
	}
}

func StartWithTLS() {
	be := &Backend{}

	instanceTls = smtp.NewServer(be)

	instanceTls.Addr = config.Addr("SMTPS", 465)
	instanceTls.Domain = config.Instance.Domain
	instanceTls.ReadTimeout = 10 * time.Second
	instanceTls.WriteTimeout = 10 * time.Second
	instanceTls.MaxMessageBytes = 1024 * 1024 * 30
	instanceTls.MaxRecipients = 50
	// force TLS for auth
	instanceTls.AllowInsecureAuth = true
	// Load the certificate and key
	cer, err := tls.LoadX509KeyPair(config.Instance.SSLPublicKeyPath, config.Instance.SSLPrivateKeyPath)
	if err != nil {
		log.Errorf("smtp ssl: load certificate failed: %v", err)
		mailstatus.Report("SMTP-SSL", config.Port("SMTPS", 465), err)
		return
	}
	// Configure the TLS support
	instanceTls.TLSConfig = &tls.Config{Certificates: []tls.Certificate{cer}}

	log.Println("Starting Smtp With SSL Server Port:", instanceTls.Addr)
	mailstatus.Report("SMTP-SSL", config.Port("SMTPS", 465), nil)
	if err := instanceTls.ListenAndServeTLS(); err != nil {
		log.Errorf("smtp ssl: listen failed: %v", err)
		mailstatus.Report("SMTP-SSL", config.Port("SMTPS", 465), err)
		return
	}
}

func Start() {
	be := &Backend{}

	instance = smtp.NewServer(be)

	instance.Addr = config.Addr("SMTP", 25)
	instance.Domain = config.Instance.Domain
	instance.ReadTimeout = 10 * time.Second
	instance.WriteTimeout = 10 * time.Second
	instance.MaxMessageBytes = 1024 * 1024 * 30
	instance.MaxRecipients = 50
	// force TLS for auth
	instance.AllowInsecureAuth = false
	// Load the certificate and key
	cer, err := tls.LoadX509KeyPair(config.Instance.SSLPublicKeyPath, config.Instance.SSLPrivateKeyPath)
	if err != nil {
		log.Errorf("smtp: load certificate failed: %v", err)
		mailstatus.Report("SMTP", config.Port("SMTP", 25), err)
		return
	}
	// Configure the TLS support
	instance.TLSConfig = &tls.Config{Certificates: []tls.Certificate{cer}}

	log.Println("Starting Smtp Server Port:", instance.Addr)
	mailstatus.Report("SMTP", config.Port("SMTP", 25), nil)
	if err := instance.ListenAndServe(); err != nil {
		log.Errorf("smtp: listen failed: %v", err)
		mailstatus.Report("SMTP", config.Port("SMTP", 25), err)
		return
	}
}

func Stop() {
	if instance != nil {
		instance.Close()
	}
	if instanceTls != nil {
		instanceTls.Close()
	}

	if instanceTlsNew != nil {
		instanceTlsNew.Close()
	}
}
