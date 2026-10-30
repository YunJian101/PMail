# 三段式构建：前端 → 内嵌前端的 Go 二进制 → 精简运行镜像
#
# 基础镜像与 npm 源都做成 ARG：网络能直连 docker.io / registry.npmjs.org 时用默认值即可；
# 连不上时可以在构建时换成可达的镜像源，例如：
#   docker build \
#     --build-arg NODE_IMAGE=<mirror>/library/node:22-alpine \
#     --build-arg GO_IMAGE=<mirror>/library/golang:1.24-alpine \
#     --build-arg RUNTIME_IMAGE=<mirror>/library/alpine:3.20 \
#     --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
#     -t pmail:local .

ARG NODE_IMAGE=node:22-alpine
ARG GO_IMAGE=golang:1.24-alpine
ARG RUNTIME_IMAGE=alpine:3.20

# ---------- 1. 构建 React 前端 ----------
FROM ${NODE_IMAGE} AS web

WORKDIR /app/web
ENV CI=1

ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry ${NPM_REGISTRY} && npm i -g pnpm@10

# 先只拷依赖清单，利用层缓存
COPY web/package.json web/pnpm-lock.yaml* web/pnpm-workspace.yaml* ./
RUN pnpm install --no-frozen-lockfile

COPY web/ ./
RUN pnpm build

# ---------- 2. 编译 Go 后端（内嵌前端产物） ----------
FROM ${GO_IMAGE} AS server

WORKDIR /app

ARG GO_PROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GO_PROXY}

# 依赖层缓存
COPY server/go.mod server/go.sum ./
RUN go mod download

COPY server/ ./

# 把前端产物放进 go:embed 目录
COPY --from=web /app/web/dist ./listen/http_server/dist

ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
    -ldflags "-s -w -X github.com/Jinnrry/pmail/utils/version.Version=${VERSION}" \
    -o /out/pmail main.go

# ---------- 3. 运行镜像 ----------
FROM ${RUNTIME_IMAGE}

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /work

# 二进制必须放在 /work 下：PMail 用「可执行文件所在目录」当 ROOT_PATH，
# 配置/证书/数据库都落在 ROOT_PATH + config/。放错位置会写进容器里的一次性目录，
# 挂载出来的 ./config 就永远是空的（安装向导第 2 步 DNS 会一片空白）。
COPY --from=server /out/pmail /work/pmail

# 双保险：显式声明根目录，避免将来换目录时又踩同一个坑
ENV PMAIL_ROOT=/work/

# SMTP 25 / HTTP 80 / POP3 110 / HTTPS 443 / SMTPS 465 / Submission 587 / POP3S 995 / IMAPS 993
EXPOSE 25 80 110 443 465 587 993 995

VOLUME ["/work/config"]

ENTRYPOINT ["/work/pmail"]
