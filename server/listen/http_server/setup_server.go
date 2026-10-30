package http_server

import (
	"errors"
	"flag"
	"fmt"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/controllers"
	"github.com/Jinnrry/pmail/dto/response"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cast"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"time"
)

// 项目初始化引导用的服务，初始化引导结束后即退出
var setupServer *http.Server

func SetupStart() {
	mux := http.NewServeMux()
	fe, err := fs.Sub(local, "dist")
	if err != nil {
		panic(err)
	}
	mux.Handle("/", http.FileServer(http.FS(fe)))
	mux.HandleFunc("/api/version", controllers.VersionInfo)
	mux.HandleFunc("/api/setup", contextIterceptor(controllers.Setup))
	// 安装模式下其它接口一律回 402「尚未完成安装」。
	// 这样前端能稳定判断出「该去向导」，不会把登录页/收件箱放出来
	// （以前这里走 Setup 处理器后什么都不写，前端拿到空 body 只能当成功）。
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		response.NewErrorResponse(response.NeedSetup, "install not finished", nil).FPrint(w)
	})
	// 挑战请求类似这样 /.well-known/acme-challenge/QPyMAyaWw9s5JvV1oruyqWHG7OqkHMJEHPoUz2046KM
	mux.HandleFunc("/.well-known/", controllers.AcmeChallenge)

	// 端口：环境变量 setup_port 优先，其次 -p 参数，最后 80。
	//
	// 这里不能直接调 flag.Parse()：安装服务会被嵌进别的进程（例如 go test 的
	// 测试二进制）里跑，那套 -test.* 参数会让 flag.Parse 直接 exit(2)，
	// 表现就是「日志说启动了、端口却没人监听」。
	HttpPort := cast.ToInt(os.Getenv("setup_port"))
	if HttpPort <= 0 {
		HttpPort = 80
	}

	portFlag := flag.NewFlagSet("setup", flag.ContinueOnError)
	portFlag.SetOutput(io.Discard)
	portFlag.IntVar(&HttpPort, "p", HttpPort, "初始化阶段Http服务端口")
	_ = portFlag.Parse(os.Args[1:])

	if HttpPort <= 0 || HttpPort > 65535 {
		HttpPort = 80
	}

	config.Instance.SetSetupPort(HttpPort)
	log.Infof("HttpServer Start On Port :%d", HttpPort)
	if HttpPort == 80 {
		log.Infof("Please click http://%s to continue.", localAddr())
	} else {
		log.Infof("Please click http://%s:%d to continue.", localAddr(), HttpPort)
	}

	setupServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", HttpPort),
		Handler:      mux,
		ReadTimeout:  time.Second * 60,
		WriteTimeout: time.Second * 60,
	}
	err = setupServer.ListenAndServe()
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}

// localAddr 直接从网卡取一个本机 IPv4，不做任何外网请求。
//
// 原来这里用的是 ip.GetIp()：它去 ip-api.com 查公网 IP、而且没有超时。
// 断网或者被墙时这一行会卡几十秒，端口也就迟迟不监听——
// 用户看到的现象就是「安装页面打不开」。这里换成纯本地判断。
func localAddr() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	for _, addr := range addrs {
		network, ok := addr.(*net.IPNet)
		if !ok || network.IP.IsLoopback() {
			continue
		}
		if v4 := network.IP.To4(); v4 != nil {
			return v4.String()
		}
	}
	return "127.0.0.1"
}

func SetupStop() {
	err := setupServer.Close()
	log.Infof("Setup End!")
	if err != nil {
		panic(err)
	}
}
