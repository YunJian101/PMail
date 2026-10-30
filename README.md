# PMail 2.0.2beta · React 前端重写版

> React frontend rewrite，版本 **2.0.2beta**。`fnos` 分支在 Docker 版基础上增加了飞牛 fnOS 的 fpk 打包与安装适配。

把 [Jinnrry/PMail](https://github.com/Jinnrry/PMail) 的前端从 **Vue3 + element-plus** 完整重写为 **React + TypeScript + Tailwind**，视觉重新设计，功能对齐原版；Go 后端本阶段保持不动。

> ✅ 当前状态：**已在本机编译通过并跑起来验证过**（`tsc` 0 错误、`vite build` 通过、Go 单二进制 18 MB 内嵌前端、安装向导/登录/收件箱/用户管理页均已真机渲染核对，并已打成 fpk 在飞牛 fnOS 上装好跑通）。

---

## 目录结构

```
web/                      React 前端（替代原来的 fe/）
  src/
    api/                  接口层，严格对齐 Go handler
    components/ui/        基础组件（Button/Input/Badge/Avatar/Switch/Tabs/Dropdown/Dialog/Tooltip…）
    components/mail/      业务组件（侧边栏 / 阅读区 / 写信浮层）
    layouts/              邮件三栏布局、管理后台布局
    pages/                登录、安装向导、收件箱、管理后台各页
    lib/                  工具（格式化、文件夹映射、正文清洗、toast）
    i18n/                 中英词条
    store/                会话、写信浮层（zustand）
    theme/                深浅色主题
server/                   Go 后端（原样，仅内嵌前端产物）
packaging/fnos/           飞牛 fpk 打包目录（manifest / 生命周期脚本 / 图标）
tools/                    构建、验收、部署脚本 + 假后端
Makefile                  前端 + 后端构建
Dockerfile                多阶段构建，产出单镜像
build.ps1                 Windows 一键构建
```

## 技术栈

| 层 | 选择 |
|---|---|
| 框架 | React 18 + TypeScript + Vite 6 |
| 样式 | Tailwind CSS v4（`@theme inline` + CSS 变量做主题） |
| 组件 | Radix 原语 + 自建 shadcn 风格组件，图标 lucide-react |
| 数据 | TanStack Query v5（缓存 / 失效 / 重试） |
| 状态 | Zustand（会话、写信浮层） |
| 路由 | react-router-dom v6，**HashRouter** |
| 富文本 | Tiptap v2（加粗 / 斜体 / 下划线 / 删除线 / 列表 / 引用 / 代码块 / 链接） |
| 国际化 | i18next（中文默认，英文完整） |
| 提示 | sonner |

## 飞牛 fpk（构建 / 自测 / 部署）

`packaging/fnos/` 是飞牛 fnOS 的应用包源码，`tools/` 下三个脚本串起整条链路（纯 ASCII 的 PowerShell，Windows PowerShell 5.1 也能直接跑）：

```powershell
# 1) 构建：前端 typecheck+build → 拷进 go:embed 目录 → go test -p 1 → linux/amd64 → fnpack
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-fpk.ps1
#    产物：release\pmail-<version>-x86.fpk（+ .sha256）

# 2) 本机安装流程验收：起真实进程走完整向导，28 项断言，不需要飞牛
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-pmail.ps1

# 3) 部署到飞牛：trim-cli 卸载旧的 → install-fpk → 等 running → HTTP 验收
powershell -NoProfile -ExecutionPolicy Bypass -File tools\deploy-fnos.ps1 -Address <你的飞牛地址> -Profile <trim-cli profile>
```

`test-pmail.ps1` 覆盖的关键点：未安装时 `/api/*` 一律 `402`（所以进不去登录页）、DNS 记录离线生成且 3 秒内返回、飞牛证书目录缺失时给出明确原因、粘贴证书会校验私钥是否配对、缺证书时收尾被拦住、条件齐全后登录能拿到管理员账号。

fpk 侧的几个约定（都是踩过的坑）：

- `cmd/main` 的退出码就是飞牛的判断依据：`start` 成功 `0` / 失败 `1`，`status` 在跑 `0` / 没跑 `3`。`status` 恒返回 0 会让飞牛以为应用已经在跑，从而**跳过启动**（界面显示 running，进程其实没起来）。
- 失败原因要同时写 `${TRIM_TEMP_LOGFILE}`，飞牛界面才看得到。
- 数据目录用 `${TRIM_PKGVAR}`（`/vol1/@appdata/pmail`），并通过 `PMail_ROOT` 告诉程序，别依赖当前目录。
- 邮件协议端口从 `ports.env` 读（`PMAIL_PORT_SMTP/SMTPS/SUBMISSION/IMAP/POP3/POP3S`），端口冲突改这里后重启应用即可；Web 端口走 `config.json` 的 `httpPort`。
- 证书步骤直接读飞牛自己管的证书目录（`/usr/trim/var/trim_connect/ssls`），按内容扫 PEM 并用 `tls.X509KeyPair` 验配对，不依赖固定文件名。
- 选「从飞牛加载」后，后端每 **12 小时**自动比对飞牛证书与本地 `config/ssl`：内容变了才覆盖并重启加载 TLS（仅 `sslSource=fnos` 生效，手动粘贴的证书不会被覆盖；开关 `autoSyncFnOsCert`）。老配置升级后若证书与飞牛一致会自动认领来源。系统设置页能看到来源 / 到期日 / 上次同步时间，也能手动「立即重新加载」。
- 应用图标（`ICON.PNG` / `ICON_256.PNG` / `app/ui/images/icon_*.png`）由 `tools/make-icons.py` 生成：信封 + `#4F83FF→#0EA5C6` 渐变，与 `web/public/favicon.svg`、登录页 logo 同一套几何；预览见 `tools/icons-preview/preview-sheet.png`。
- 卸载应用**不会**删除 `/vol1/@appdata/pmail`，重装后会沿用旧配置；想要干净的安装向导，先把该目录改名或删掉再装。

## 开发与构建

```bash
# 前端开发（/api 会代理到本地 Go 服务，默认 127.0.0.1:80）
cd web && pnpm install && pnpm dev
# 端口或后端地址不同时：
PMAIL_API=http://127.0.0.1:8080 pnpm dev

# 类型检查
cd web && pnpm typecheck

# 完整构建（前端 → 内嵌目录 → Go 单二进制）
make            # Linux / macOS / WSL
# 或 Windows：
pwsh -ExecutionPolicy Bypass -File .\build.ps1

# 容器（推荐：compose 一条命令搞定构建 + 启动）
docker compose up -d --build
# 首次打开 http://localhost/ 走安装向导；数据都在 ./config

# 只想手动构建镜像时
docker build -t pmail:local .
# 基础镜像/源连不上时，用构建参数换可达的镜像源（compose 里改 .env 更省事）：
# docker build --build-arg NODE_IMAGE=<mirror>/library/node:22-alpine \
#              --build-arg GO_IMAGE=<mirror>/library/golang:1.24-alpine \
#              --build-arg RUNTIME_IMAGE=<mirror>/library/alpine:3.20 \
#              --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
#              --build-arg GO_PROXY=https://goproxy.cn,direct -t pmail:local .
docker run -p 25:25 -p 80:80 -p 443:443 -p 110:110 -p 465:465 -p 587:587 -p 993:993 -p 995:995 \
  -v $(pwd)/config:/work/config pmail:local
```

### compose 说明

- `compose.yaml` 里 `build.args` 与 `environment` 都走变量，同目录的 `.env` 会被自动读取；`.env.example` 是模板。
- 端口占用：首次安装向导跑在容器内 **80**，宿主机 80 被占用时把映射改成 `"8080:80"`，装完再用 `http://localhost:8080` 访问。
- 数据卷：`./config` 挂到容器 `/work/config`，配置、DKIM 私钥、证书、SQLite 库都在里面，重建容器不丢。
- 健康检查：`wget http://127.0.0.1:80/api/ping`，未安装时返回 `errorNo:402` 也算存活。
- 换源：拉不动 `docker.io` / `registry.npmjs.org` 时，在 `.env` 里覆盖 `NODE_IMAGE` / `GO_IMAGE` / `RUNTIME_IMAGE` / `NPM_REGISTRY` / `GO_PROXY`，不用改 Dockerfile。
- **镜像里二进制必须放在 `/work` 下**（`/work/pmail` + `ENV PMAIL_ROOT=/work/`）：PMail 拿「可执行文件所在目录」当 `ROOT_PATH`，配置、证书、SQLite 库都在 `ROOT_PATH/config/`。放到别处会写进容器内的一次性目录，挂出来的 `./config` 永远是空的，安装向导第 2 步 DNS 会一片空白。
- 安装向导第 2 步（DNS 记录）**完全在本地算**，不联网也能出结果：A 记录的值是占位符，页面上填一次公网 IP 就会实时替换。`compose.yaml` 仍然把 `HTTP_PROXY` / `HTTPS_PROXY` 透传给容器，需要走代理时在 `.env` 里填即可。

前端产物最终落在 `server/listen/http_server/dist/`，由 Go 的 `go:embed` 打进二进制 —— 和上游完全一致，所以「单文件部署」这个特性没有丢。

## 功能对照

| 原 Vue | 新 React | 用到的接口 |
|---|---|---|
| `LoginView` | `pages/login.tsx` | `POST /api/login` |
| `SetupView` | `pages/setup.tsx` | `POST /api/setup/*`（见 `server/controllers/setup.go`） |
| `ListView` + `HomeAside` + `HomeHeader` | `pages/mail/inbox.tsx` + `components/mail/sidebar.tsx` | `GET /api/group`、`POST /api/email/list` |
| `EmailDetailView` | `components/mail/reader.tsx` | `POST /api/email/detail`、`/attachments/*` |
| `EditerView` | `components/mail/composer.tsx` | `POST /api/email/send` |
| `UserManagement` | `pages/admin/users.tsx` | `POST /api/user/{list,create,edit}` |
| `GroupSettings` | `pages/admin/folders.tsx` | `GET /api/group/list`、`POST /api/group/{add,del}` |
| `RuleSettings` | `pages/admin/rules.tsx` | `GET /api/rule/get`、`POST /api/rule/{add,del}` |
| `SecuritySettings` | `pages/admin/security.tsx` | `POST /api/settings/modify_password` |
| `PluginSettings` | `pages/admin/plugins.tsx` | `GET /api/plugin/list`、`GET /api/plugin/settings/{name}` |

## 与后端对齐时踩到的坑（都已处理）

1. **HTTP 状态码恒为 200**，业务结果在 `body.errorNo`（0 成功 / 402 未安装 / 403 未登录 / 405 无权限 / 100 参数错 / 500 服务端）。`api/client.ts` 统一拆信封，402/403 通过注册回调跳转，避免 router 与 client 循环依赖。
2. **`/api/email/list` 的 `tag` 是「字符串化的 JSON」**，必须是 `'{"type":0,"status":-1,"group_id":0}'` 这种形式，传对象会被静默忽略。
3. **同一份「用户」有两套字段名**：`/api/login`、`/api/user/info` 是 `account/name/is_admin`（`is_admin` 是 int，不是 bool），而 `/api/user/*` 是 PascalCase `ID/Account/Name/Disabled/IsAdmin`；创建用户的显示名字段叫 `username`。
4. **没有 SPA fallback**：后端 `mux.Handle("/", http.FileServer(...))` 对未知路径直接 404，所以用 `HashRouter`，深链接不会 404。
5. **附件上行是 base64 data URL**，字段名 `attrs`（不是 `attachments`）；下行是裸直链 `/attachments/download/{emailId}/{index}`，且后端把 `Content-Type` 拼成了 `ContentType`，只靠 `Content-Disposition` 生效。
6. **插件设置页返回 HTML 不是 JSON**，且插件不存在时是空 body，所以用 iframe 嵌，并做了容错。
7. **正文 HTML 不可信**：`lib/sanitize.ts` 会剔除 `script/iframe/object/embed/form` 与所有 `on*` 属性、`javascript:` 协议，并把 `cid:` 图片改写到 `/attachments/{id}/{cid}`；`html` 为空时才回退纯文本并按段落渲染。
8. **删除语义**：在「已删除」里删除才是彻底删除（`forcedDel=true`），其它文件夹删除只是移入已删除。

## 已知限制（后端没有对应能力，前端不造假）

| 想做的功能 | 现状 |
|---|---|
| 星标 / 收藏 | 后端 7 个 model 里没有任何 star/flag 字段，`SearchTag` 只有 `type/status/group_id`，所以**不做** |
| 未读 / 归档等智能文件夹 | 同上，列表接口不支持按已读过滤 |
| 「保存草稿」 | 后端没有写草稿的接口（`user_email.status=4` 只能由别处产生），写信浮层因此只有发送 / 丢弃 |
| 删除用户 | 后端只有 create / edit / list，所以「删除」改成「停用」（`disabled`） |
| 设为管理员 | `user/create|edit` 的入参里没有 `is_admin` 字段，表单里只保留一行说明，不再放存不进去的开关 |
| 系统设置读写 | 没有读配置的接口，设置页只做只读展示 + 说明「改 config.json 并重启」 |
| 邮件列表的「未读数」 | 列表接口不返回未读计数，只显示当前页条数 |

## 本地 UI 联调（不启动真实邮件服务）

```bash
node tools/mock-api.mjs                                  # 假后端，默认 127.0.0.1:18081
PMAIL_API=http://127.0.0.1:18081 pnpm --dir web dev      # 前端指向它
# 想看登录页就去掉 MOCK_OPEN=1；想直接看内部页面就 MOCK_OPEN=1 node tools/mock-api.mjs
```

`tools/mock-api.mjs` 按真实 handler 的信封与字段名返回假数据，**只用于开发和截图，不会被打进二进制**。

## 验证记录

| 项目 | 结果 |
|---|---|
| `tsc -b`（含 `noUnusedLocals`） | 0 错误 |
| `vite build` | 1946 modules，CSS 48 KB / JS 1000 KB（gzip 314 KB） |
| `go build`（内嵌前端） | 成功，单文件 18 MB |
| `go test -p 1 ./...` | 21 个包全绿（含安装全流程 E2E：域名 → DNS → 数据库 → 证书 → 管理员 → 登录 → 收发信 → 规则 → 分组） |
| `tools/test-pmail.ps1` | 28/28 通过（未安装 402 拦截、离线 DNS、证书两种方式、收尾条件校验） |
| 安装向导（真实 Go 二进制） | 渲染正常，五步流程可走；未完成安装时任何路径都回向导 |
| 登录页 / 收件箱三栏 / 用户管理 | 渲染正常，正文 XSS 被清洗、`{count}` 占位符与收件人 JSON 串均正确显示 |
| 深色模式 | 走 `prefers-color-scheme` 自动切换，三栏对比度正常 |
| 窄屏（900px / 600px） | 侧边栏收起为顶栏（含文件夹下拉与写邮件），列表与阅读区切换为单栏 + 返回按钮 |
| `docker build` | 成功，镜像 **40.7 MB**（多阶段：node 构建 → go 编译 → alpine 运行） |
| `docker run` | 容器内 `/api/ping` 返回 `{"errorNo":402}`（未安装态正确），前端静态资源正常下发 |
| fpk（飞牛 fnOS x86） | 打包 7.6 MB，真机安装 → 启动 → 向导页正常，`/api/ping` 402，离线 DNS 与「从飞牛加载证书」均实测可用 |

> 本机 Docker Desktop 的一个小坑：发布端口后 `127.0.0.1:端口` 连不上，但 `localhost:端口` 正常，属于宿主机端口转发层的问题，与镜像无关。

已知未做：`<768px` 的手势/抽屉式导航（现在是顶栏下拉）；Web 后台的「系统设置」仍只读（后端没有读配置的接口）。

## 下一步

1. 补自动化 UI 回归（安装向导的 DNS / 证书两屏目前靠接口断言 + 人工核对）。
2. 第二阶段：按约定重构 Go 后端（拆 handler/service、补 OpenAPI、补星标与草稿能力、修 `ContentType` 拼写与插件空 body）。
3. 飞牛侧继续打磨：应用设置页暴露常用端口与公网 IP，省得手改 `ports.env`。
