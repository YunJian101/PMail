package pop3_server

import (
	"crypto/rand"
	"crypto/tls"
	"github.com/Jinnrry/gopop"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/listen/mailstatus"
	log "github.com/sirupsen/logrus"
	"time"
)

var instance *gopop.Server
var instanceTls *gopop.Server

func StartWithTls() {
	pop3sPort := config.Port("POP3S", 995)

	crt, err := tls.LoadX509KeyPair(config.Instance.SSLPublicKeyPath, config.Instance.SSLPrivateKeyPath)
	if err != nil {
		// 证书加载失败只影响这个服务，不能让整个进程退出
		log.Errorf("pop3s: load certificate failed: %v", err)
		mailstatus.Report("POP3S", pop3sPort, err)
		return
	}
	tlsConfig := &tls.Config{}
	tlsConfig.Certificates = []tls.Certificate{crt}
	tlsConfig.Time = time.Now
	tlsConfig.Rand = rand.Reader
	instanceTls = gopop.NewPop3Server(pop3sPort, "pop."+config.Instance.Domain, true, tlsConfig, action{})
	instanceTls.ConnectAliveTime = 5 * time.Minute

	log.Infof("POP3 With TLS Server Start On Port :%d", pop3sPort)
	// 先登记为监听中：Start 成功会一直阻塞
	mailstatus.Report("POP3S", pop3sPort, nil)

	if err := instanceTls.Start(); err != nil {
		// 端口被占用时不能杀掉进程，否则网页也打不开、没地方改端口
		log.Errorf("pop3s: listen failed: %v", err)
		mailstatus.Report("POP3S", pop3sPort, err)
		return
	}
}

func Start() {
	pop3Port := config.Port("POP3", 110)

	crt, err := tls.LoadX509KeyPair(config.Instance.SSLPublicKeyPath, config.Instance.SSLPrivateKeyPath)
	if err != nil {
		log.Errorf("pop3: load certificate failed: %v", err)
		mailstatus.Report("POP3", pop3Port, err)
		return
	}
	tlsConfig := &tls.Config{}
	tlsConfig.Certificates = []tls.Certificate{crt}
	tlsConfig.Time = time.Now
	tlsConfig.Rand = rand.Reader
	instance = gopop.NewPop3Server(pop3Port, "pop."+config.Instance.Domain, false, tlsConfig, action{})
	instance.ConnectAliveTime = 5 * time.Minute
	log.Infof("POP3 Server Start On Port :%d", pop3Port)
	mailstatus.Report("POP3", pop3Port, nil)

	if err := instance.Start(); err != nil {
		log.Errorf("pop3: listen failed: %v", err)
		mailstatus.Report("POP3", pop3Port, err)
		return
	}
}

func Stop() {
	if instance != nil {
		instance.Stop()
	}

	if instanceTls != nil {
		instanceTls.Stop()
	}
}
