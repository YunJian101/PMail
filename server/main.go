package main

import (
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/listen/cron_server"
	"github.com/Jinnrry/pmail/res_init"
	"github.com/Jinnrry/pmail/utils/version"
	log "github.com/sirupsen/logrus"
)

func main() {

	config.Init()

	info := version.Info()

	log.Infoln("*******************************************************************")
	log.Infof("***\tServer Start Success \n")
	log.Infof("***\tServer Version: %s \n", info["version"])
	log.Infof("***\tGit Commit Hash: %s ", info["gitHash"])
	log.Infof("***\tBuild Date: %s ", info["buildTime"])
	log.Infof("***\tBuild GoLang Version: %s ", info["goVersion"])
	log.Infoln("*******************************************************************")

	// 定时任务启动
	go cron_server.Start()

	// 核心服务启动
	res_init.Init(info["version"])

	log.Warnf("Server Stoped \n")

}
