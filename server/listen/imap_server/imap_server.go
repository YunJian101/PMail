package imap_server

import (
	"crypto/tls"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/listen/mailstatus"
	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapserver"
	log "github.com/sirupsen/logrus"
	"os"
)

var instanceTLS *imapserver.Server

func Stop() {
	if instanceTLS != nil {
		instanceTLS.Close()
		instanceTLS = nil
	}
}

// StarTLS 启动TLS端口监听，不加密的代码就懒得写了
func StarTLS() {
	imapPort := config.Port("IMAP", 993)

	server, err := newIMAPServer()
	if err != nil {
		// 证书加载失败只影响 IMAP，不能让整个进程退出
		log.Errorf("imap: load certificate failed: %v", err)
		mailstatus.Report("IMAP", imapPort, err)
		return
	}
	instanceTLS = server

	log.Infof("IMAP With TLS Server Start On Port :%d", imapPort)
	if err := instanceTLS.ListenAndServeTLS(config.Addr("IMAP", 993)); err != nil {
		// 端口被占用时不能杀掉进程，否则网页也打不开、没地方改端口
		log.Errorf("imap: listen failed: %v", err)
		mailstatus.Report("IMAP", imapPort, err)
		return
	}
	mailstatus.Report("IMAP", imapPort, nil)
}

func newIMAPServer() (*imapserver.Server, error) {
	crt, err := tls.LoadX509KeyPair(config.Instance.SSLPublicKeyPath, config.Instance.SSLPrivateKeyPath)
	if err != nil {
		return nil, err
	}
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{crt},
	}

	memServer := NewServer()

	option := &imapserver.Options{
		NewSession: func(conn *imapserver.Conn) (imapserver.Session, *imapserver.GreetingData, error) {
			return memServer.NewSession(), nil, nil
		},
		Caps: imap.CapSet{
			imap.CapIMAP4rev1: {},
			imap.CapIdle:      {},
		},
		TLSConfig:    tlsConfig,
		InsecureAuth: false,
	}

	if config.Instance.LogLevel == "debug" {
		option.DebugWriter = os.Stdout
	}

	return imapserver.New(option), nil
}
