# PMail · React 前端重写版 构建脚本
#
# 目录约定（和上游一致）：
#   web/      React + TypeScript 前端（替代原来的 fe/）
#   server/   Go 后端（本阶段未改动，仅替换内嵌的静态资源目录）
#
# 前端产物最终要落到 server/listen/http_server/dist，
# 由 res_init / http_server 里的 go:embed 打进二进制。

PNPM      ?= pnpm
GO        ?= go
WEB_DIR   := web
SERVER_DIR:= server
EMBED_DIR := $(SERVER_DIR)/listen/http_server/dist
VERSION   ?= $(shell git describe --tags --always 2>/dev/null || echo dev)
LDFLAGS   := -s -w -X 'main.goVersion=$(VERSION)'

.PHONY: all web-deps web server clean clean-web clean-server check

all: web server

## ---------- 前端 ----------
web-deps:
	cd $(WEB_DIR) && $(PNPM) install

web: web-deps
	cd $(WEB_DIR) && $(PNPM) build
	rm -rf $(EMBED_DIR)
	mkdir -p $(EMBED_DIR)
	cp -r $(WEB_DIR)/dist/. $(EMBED_DIR)/

## ---------- 后端 ----------
server:
	cd $(SERVER_DIR) && CGO_ENABLED=0 $(GO) build -trimpath -ldflags "$(LDFLAGS)" -o ../pmail main.go

## 交叉编译（按需使用）
server-all:
	cd $(SERVER_DIR) && CGO_ENABLED=0 GOOS=linux   GOARCH=amd64 $(GO) build -trimpath -ldflags "$(LDFLAGS)" -o ../pmail_linux_amd64 main.go
	cd $(SERVER_DIR) && CGO_ENABLED=0 GOOS=linux   GOARCH=arm64 $(GO) build -trimpath -ldflags "$(LDFLAGS)" -o ../pmail_linux_arm64 main.go
	cd $(SERVER_DIR) && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GO) build -trimpath -ldflags "$(LDFLAGS)" -o ../pmail_windows_amd64.exe main.go
	cd $(SERVER_DIR) && CGO_ENABLED=0 GOOS=darwin  GOARCH=arm64 $(GO) build -trimpath -ldflags "$(LDFLAGS)" -o ../pmail_mac_arm64 main.go

## ---------- 清理 ----------
clean: clean-web clean-server

clean-web:
	rm -rf $(WEB_DIR)/dist $(EMBED_DIR)

clean-server:
	rm -f pmail pmail_*

## ---------- 自检 ----------
check:
	cd $(WEB_DIR) && $(PNPM) typecheck
	cd $(SERVER_DIR) && $(GO) vet ./...

docker:
	docker build -t pmail:local .
