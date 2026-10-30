# PMail for 飞牛 fnOS（fpk）

> 自建域名邮箱的**飞牛 fnOS 安装包**分支：Go 后端 + React 网页端，打包成 `.fpk`，在飞牛应用中心一键安装。

本分支只负责 **fnOS fpk 的打包、安装与运行**。容器部署、镜像构建等其它安装方式不在本分支范围内。

- 应用代码：Go（单二进制，前端 `go:embed` 内嵌）
- 网页端：React 18 + TypeScript + Vite + Tailwind v4（相比上游 Vue 版完全重写）
- 安装形态：飞牛 `.fpk`（x86），数据目录 `/vol1/@appdata/pmail`

---

## 目录结构

```
server/                   Go 后端（含 go:embed 的前端产物）
web/                      React 前端
packaging/fnos/           飞牛 fpk 打包目录
  pkg/manifest            fpk 清单（版本号唯一来源）
  pkg/cmd/                生命周期脚本（install/config/main/uninstall/upgrade）
  pkg/wizard/             飞牛「应用设置」表单（端口配置）
  pkg/app/ui/             桌面入口与图标
  pkg/config/             privilege / resource
  ICON.PNG ICON_256.PNG   应用图标
tools/
  build-fpk.ps1           构建 fpk（前端 typecheck → 测试 → 交叉编译 → fnpack）
  test-pmail.ps1          本机跑完整安装流程验收（不需要飞牛）
  deploy-fnos.ps1         部署到飞牛设备（trim-cli）
  mock-api.mjs            假后端，前端联调用
  make-icons.py           生成应用图标
```

## 构建 fpk

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-fpk.ps1
```

一条命令串完：

1. `tsc -b` 类型检查 + `vite build`
2. 前端产物拷进 `server/listen/http_server/dist/`（`go:embed` 目录）
3. `go test -p 1 ./...`（包含安装全流程 E2E）
4. 交叉编译 `linux/amd64`（注入版本号 / 构建时间）
5. `fnpack build`

产物：`release/pmail-<version>-x86.fpk` 与同名 `.sha256`。版本号只改 `packaging/fnos/pkg/manifest` 一处。

跳过测试：`-SkipTest`。

## 本机验收（不用飞牛）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\test-pmail.ps1
```

在 `.tmp/e2e` 起一个真实进程，走「未安装 → 域名 → DNS → 证书 → 管理员 → 登录 → 收件箱 → 账户设置 → 端口」的完整链路，逐项断言（当前 50 项）：

- 未安装时 `/api/ping` 返回 402，登录被拦截
- DNS 记录完全离线生成（< 3s）
- 证书两种来源：粘贴 / 从飞牛读取；域名不匹配时拒绝
- 账户：改显示名、改密码（旧密码校验、长度限制）
- 停用账号登录时报明确原因，且旧会话立刻失效
- 端口状态上报、非法端口拒绝

## 部署到飞牛

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\deploy-fnos.ps1 `
  -Address <设备IP> -Profile <trim-cli 配置名> -Fpk release\pmail-<version>-x86.fpk
```

流程：卸载旧版 → `install-fpk` → 轮询应用状态直到 running → HTTP 验收（端口、SPA、未登录拦截、登录接口）。

设备上验收通过后，桌面会出现 PMail 图标；首次打开走安装向导。

## 端口与配置

| 端口 | 默认 | 在哪改 |
|---|---|---|
| 网页 | 8080 | 飞牛「应用设置」或应用内「系统设置 → 邮件端口」 |
| SMTP / SMTPS / 提交 | 25 / 465 / 587 | 同上 |
| IMAP / POP3 / POP3S | 993 / 110 / 995 | 同上 |

- 配置落在应用数据目录的 `ports.env`，改完自动重启应用生效。
- 安装时若 8080 被占用，会自动顺延找一个空闲端口，并同步桌面入口。
- **邮件端口被占用不会导致应用退出**：网页照常能开，在设置里能看到哪个端口没起来、直接改。
- 为兼容老配置，程序启动时会自动修正「邮箱域名误填成 `smtp.example.com`」的情况（改前备份 `config.json` 与 `pmail.db`）。

## 开发联调（不起真实邮件服务）

```bash
node tools/mock-api.mjs                              # 假后端，默认 127.0.0.1:18081
PMAIL_API=http://127.0.0.1:18081 pnpm --dir web dev  # 前端指向它
# 直接看内部页面：MOCK_OPEN=1 node tools/mock-api.mjs
```

`mock-api.mjs` 按真实 handler 的信封与字段名返回假数据，只用于开发和截图，不会被打进二进制。

## 功能

| 模块 | 说明 |
|---|---|
| 安装向导 | 域名 → DNS 记录（离线生成）→ 证书（飞牛证书 / 粘贴）→ 数据库 → 管理员 |
| 邮件 | 收件箱 / 发件箱 / 草稿 / 垃圾 / 已删除 / 自定义分组，搜索、分页、批量操作 |
| 阅读与写信 | 正文 HTML 清洗、附件下载、回复 / 回复全部 / 转发、富文本写信 |
| 未读 | 各文件夹未读徽标、15 秒轮询、新邮件提示、打开即标已读 |
| 移动规则 | 收到的邮件不能进发件箱/草稿箱，发出的不能进收件箱/垃圾箱；已删除只能原路还原 |
| 账户 | 改显示名、改密码（需旧密码）；登录名由管理员维护 |
| 管理服务器 | 用户（新建/编辑/停用/重置密码）、分组、规则、插件、证书与端口状态、系统信息 |
| 多端 | 桌面三栏；窄屏单栏 + 顶栏（文件夹切换 / 账号菜单），管理页同样适配 |

## 与后端对齐时踩到的坑（都已处理）

1. **HTTP 状态码恒为 200**，业务结果在 `body.errorNo`（0 成功 / 402 未安装 / 403 未登录 / 405 无权限 / 100 参数错 / 500 服务端）。
2. **`/api/email/list` 的 `tag` 是字符串化的 JSON**，必须是 `'{"type":0,"status":-1,"group_id":0}'` 形式。
3. **用户对象有两套字段名**：`/api/login`、`/api/user/info` 用 `account/name/is_admin`（int），`/api/user/*` 用 PascalCase `ID/Account/Name/Disabled/IsAdmin`；创建时显示名字段叫 `username`。
4. **没有 SPA fallback**，所以用 `HashRouter`，深链接不会 404。
5. **附件上行是 base64 data URL**，字段名 `attrs`；下行是裸直链 `/attachments/download/{emailId}/{index}`。
6. **正文 HTML 不可信**：剔除 `script/iframe/object/embed/form` 与 `on*`、`javascript:`，`cid:` 图片改写到本地。
7. **删除语义**：在「已删除」里删除才是彻底删除，其它文件夹删除只是移入已删除。
8. **会话只存 user id**：名字/权限每次查库，否则改名后页面一直显示旧名字；被停用/删除时旧会话立即失效。

## 已知限制

| 想做的功能 | 现状 |
|---|---|
| 星标 / 收藏 | 后端没有对应字段，不做 |
| 「保存草稿」 | 后端没有写草稿的接口，写信只有发送 / 丢弃 |
| 删除用户 | 后端只有 create / edit / list，所以用「停用」代替 |
| 设为管理员 | 入参没有 `is_admin`，表单只保留说明 |
| HTTPS 网页 | fpk 默认走 HTTP（飞牛网关/内网），证书只用于邮件协议 |

## 验证记录

| 项目 | 结果 |
|---|---|
| `tsc -b`（含 `noUnusedLocals`） | 0 错误 |
| `go test -p 1 ./...` | 23 个包全绿 |
| `tools/test-pmail.ps1` | 50/50 |
| 移动/删除矩阵测试 | 5 个箱子两两互移 25 组 + 每箱软删/彻底删 + 已读不改归属 |
| 真机（飞牛 fnOS x86） | fpk 约 7.7 MB，安装 → 启动 → 向导 → 收发信可用；部署检查 8/8 |

## 下一步

1. 补 UI 自动化回归（向导的 DNS / 证书两屏目前靠接口断言 + 人工核对）。
2. 飞牛应用设置页继续完善（公网 IP、常用开关）。
3. 后端能力补齐后再做星标、草稿保存等功能。

---

上游项目：[Jinnrry/PMail](https://github.com/Jinnrry/PMail)。本项目保持原后端语义，前端为完全重写。
