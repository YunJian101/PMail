# PMail 2.0.0beta

> 版本 **2.0.0beta**：前端 React 重写版

# PMail 路 React 鍓嶇閲嶅啓鐗?
鎶?[Jinnrry/PMail](https://github.com/Jinnrry/PMail) 鐨勫墠绔粠 **Vue3 + element-plus** 瀹屾暣閲嶅啓涓?**React + TypeScript + Tailwind**锛岃瑙夐噸鏂拌璁★紝鍔熻兘瀵归綈鍘熺増锛汫o 鍚庣鏈樁娈典繚鎸佷笉鍔ㄣ€?
> 鉁?褰撳墠鐘舵€侊細**宸插湪鏈満缂栬瘧閫氳繃骞惰窇璧锋潵楠岃瘉杩?*锛坄tsc` 0 閿欒銆乣vite build` 閫氳繃銆丟o 鍗曚簩杩涘埗 18.4 MB 鍐呭祵鍓嶇銆乻etup 鍚戝涓庣櫥褰?鏀朵欢绠?鐢ㄦ埛绠＄悊椤靛潎宸茬湡鏈烘覆鏌撴牳瀵癸級銆?
---

## 鐩綍缁撴瀯

```
web/                      React 鍓嶇锛堟浛浠ｅ師鏉ョ殑 fe/锛?  src/
    api/                  鎺ュ彛灞傦紝涓ユ牸瀵归綈 Go handler
    components/ui/        鍩虹缁勪欢锛圔utton/Input/Badge/Avatar/Switch/Tabs/Dropdown/Dialog/Tooltip鈥︼級
    components/mail/      涓氬姟缁勪欢锛堜晶杈规爮 / 闃呰鍖?/ 鍐欎俊娴眰锛?    layouts/              閭欢涓夋爮甯冨眬銆佺鐞嗗悗鍙板竷灞€
    pages/                鐧诲綍銆佸畨瑁呭悜瀵笺€佹敹浠剁銆佺鐞嗗悗鍙板悇椤?    lib/                  宸ュ叿锛堟牸寮忓寲銆佹枃浠跺す鏄犲皠銆佹鏂囨竻娲椼€乼oast锛?    i18n/                 涓嫳璇嶆潯
    store/                浼氳瘽銆佸啓淇℃诞灞傦紙zustand锛?    theme/                娣辨祬鑹蹭富棰?server/                   Go 鍚庣锛堝師鏍凤紝浠呭唴宓屽墠绔骇鐗╋級
Makefile                  鍓嶇 + 鍚庣鏋勫缓
Dockerfile                澶氶樁娈垫瀯寤猴紝浜у嚭鍗曢暅鍍?build.ps1                 Windows 涓€閿瀯寤?```

## 鎶€鏈爤

| 灞?| 閫夋嫨 |
|---|---|
| 妗嗘灦 | React 18 + TypeScript + Vite 6 |
| 鏍峰紡 | Tailwind CSS v4锛坄@theme inline` + CSS 鍙橀噺鍋氫富棰橈級 |
| 缁勪欢 | Radix 鍘熻 + 鑷缓 shadcn 椋庢牸缁勪欢锛屽浘鏍?lucide-react |
| 鏁版嵁 | TanStack Query v5锛堢紦瀛?/ 澶辨晥 / 閲嶈瘯锛?|
| 鐘舵€?| Zustand锛堜細璇濄€佸啓淇℃诞灞傦級 |
| 璺敱 | react-router-dom v6锛?*HashRouter** |
| 瀵屾枃鏈?| Tiptap v2锛堝姞绮?/ 鏂滀綋 / 涓嬪垝绾?/ 鍒犻櫎绾?/ 鍒楄〃 / 寮曠敤 / 浠ｇ爜鍧?/ 閾炬帴锛?|
| 鍥介檯鍖?| i18next锛堜腑鏂囬粯璁わ紝鑻辨枃瀹屾暣锛?|
| 鎻愮ず | sonner |

## 寮€鍙戜笌鏋勫缓

```bash
# 鍓嶇寮€鍙戯紙/api 浼氫唬鐞嗗埌鏈湴 Go 鏈嶅姟锛岄粯璁?127.0.0.1:80锛?cd web && pnpm install && pnpm dev
# 绔彛鎴栧悗绔湴鍧€涓嶅悓鏃讹細
PMAIL_API=http://127.0.0.1:8080 pnpm dev

# 绫诲瀷妫€鏌?cd web && pnpm typecheck

# 瀹屾暣鏋勫缓锛堝墠绔?鈫?鍐呭祵鐩綍 鈫?Go 鍗曚簩杩涘埗锛?make            # Linux / macOS / WSL
# 鎴?Windows锛?pwsh -ExecutionPolicy Bypass -File .\build.ps1

# 瀹瑰櫒锛堟帹鑽愶細compose 涓€鏉″懡浠ゆ悶瀹氭瀯寤?+ 鍚姩锛?docker compose up -d --build
# 棣栨鎵撳紑 http://localhost/ 璧板畨瑁呭悜瀵硷紱鏁版嵁閮藉湪 ./config

# 鍙兂鎵嬪姩鏋勫缓闀滃儚鏃?docker build -t pmail:local .
# 鍩虹闀滃儚/婧愯繛涓嶄笂鏃讹紝鐢ㄦ瀯寤哄弬鏁版崲鍙揪鐨勯暅鍍忔簮锛坈ompose 閲屾敼 .env 鏇寸渷浜嬶級锛?# docker build --build-arg NODE_IMAGE=<mirror>/library/node:22-alpine \
#              --build-arg GO_IMAGE=<mirror>/library/golang:1.24-alpine \
#              --build-arg RUNTIME_IMAGE=<mirror>/library/alpine:3.20 \
#              --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
#              --build-arg GO_PROXY=https://goproxy.cn,direct -t pmail:local .
docker run -p 25:25 -p 80:80 -p 443:443 -p 110:110 -p 465:465 -p 587:587 -p 993:993 -p 995:995 \
  -v $(pwd)/config:/work/config pmail:local
```

### compose 璇存槑

- `compose.yaml` 閲?`build.args` 涓?`environment` 閮借蛋鍙橀噺锛屽悓鐩綍鐨?`.env` 浼氳鑷姩璇诲彇锛沗.env.example` 鏄ā鏉裤€?- 绔彛鍗犵敤锛氶娆″畨瑁呭悜瀵艰窇鍦ㄥ鍣ㄥ唴 **80**锛屽涓绘満 80 琚崰鐢ㄦ椂鎶婃槧灏勬敼鎴?`"8080:80"`锛岃瀹屽啀鐢?`http://localhost:8080` 璁块棶銆?- 鏁版嵁鍗凤細`./config` 鎸傚埌瀹瑰櫒 `/work/config`锛岄厤缃€丏KIM 绉侀挜銆佽瘉涔︺€丼QLite 搴撻兘鍦ㄩ噷闈紝閲嶅缓瀹瑰櫒涓嶄涪銆?- 鍋ュ悍妫€鏌ワ細`wget http://127.0.0.1:80/api/ping`锛屾湭瀹夎鏃惰繑鍥?`errorNo:402` 涔熺畻瀛樻椿銆?- 鎹㈡簮锛氭媺涓嶅姩 `docker.io` / `registry.npmjs.org` 鏃讹紝鍦?`.env` 閲岃鐩?`NODE_IMAGE` / `GO_IMAGE` / `RUNTIME_IMAGE` / `NPM_REGISTRY` / `GO_PROXY`锛屼笉鐢ㄦ敼 Dockerfile銆?- **闀滃儚閲屼簩杩涘埗蹇呴』鏀惧湪 `/work` 涓?*锛坄/work/pmail` + `ENV PMAIL_ROOT=/work/`锛夛細PMail 鎷裤€屽彲鎵ц鏂囦欢鎵€鍦ㄧ洰褰曘€嶅綋 `ROOT_PATH`锛岄厤缃€佽瘉涔︺€丼QLite 搴撻兘鍦?`ROOT_PATH/config/`銆傛斁鍒板埆澶勪細鍐欒繘瀹瑰櫒鍐呯殑涓€娆℃€х洰褰曪紝鎸傚嚭鏉ョ殑 `./config` 姘歌繙鏄┖鐨勶紝瀹夎鍚戝绗?2 姝?DNS 浼氫竴鐗囩┖鐧姐€?- 瀹夎鍚戝绗?2 姝ワ紙DNS 璁板綍锛夐渶瑕佸鍣ㄨ兘鍑虹綉锛氬悗绔細璇锋眰澶栭儴鎺ュ彛鎷垮叕缃?IP锛屾病鏈夊嚭缃戣兘鍔涗細涓€鐩村崱浣忋€俙compose.yaml` 宸茬粡鎶?`HTTP_PROXY` / `HTTPS_PROXY` 閫忎紶缁欏鍣紝鍦?`.env` 閲屽～鍗冲彲锛涘墠绔杩欎竴姝ュ崟鐙浜?25 绉掕秴鏃跺苟缁欏嚭鎻愮ず銆?```

鍓嶇浜х墿鏈€缁堣惤鍦?`server/listen/http_server/dist/`锛岀敱 Go 鐨?`go:embed` 鎵撹繘浜岃繘鍒?鈥斺€?鍜屼笂娓稿畬鍏ㄤ竴鑷达紝鎵€浠ャ€屽崟鏂囦欢閮ㄧ讲銆嶈繖涓壒鎬ф病鏈変涪銆?
## 鍔熻兘瀵圭収

| 鍘?Vue | 鏂?React | 鐢ㄥ埌鐨勬帴鍙?|
|---|---|---|
| `LoginView` | `pages/login.tsx` | `POST /api/login` |
| `SetupView` | `pages/setup.tsx` | `POST /api/setup/*`锛堣 `server/controllers/setup.go`锛?|
| `ListView` + `HomeAside` + `HomeHeader` | `pages/mail/inbox.tsx` + `components/mail/sidebar.tsx` | `GET /api/group`銆乣POST /api/email/list` |
| `EmailDetailView` | `components/mail/reader.tsx` | `POST /api/email/detail`銆乣/attachments/*` |
| `EditerView` | `components/mail/composer.tsx` | `POST /api/email/send` |
| `UserManagement` | `pages/admin/users.tsx` | `POST /api/user/{list,create,edit}` |
| `GroupSettings` | `pages/admin/folders.tsx` | `GET /api/group/list`銆乣POST /api/group/{add,del}` |
| `RuleSettings` | `pages/admin/rules.tsx` | `GET /api/rule/get`銆乣POST /api/rule/{add,del}` |
| `SecuritySettings` | `pages/admin/security.tsx` | `POST /api/settings/modify_password` |
| `PluginSettings` | `pages/admin/plugins.tsx` | `GET /api/plugin/list`銆乣GET /api/plugin/settings/{name}` |

## 涓庡悗绔榻愭椂韪╁埌鐨勫潙锛堥兘宸插鐞嗭級

1. **HTTP 鐘舵€佺爜鎭掍负 200**锛屼笟鍔＄粨鏋滃湪 `body.errorNo`锛? 鎴愬姛 / 402 鏈畨瑁?/ 403 鏈櫥褰?/ 405 鏃犳潈闄?/ 100 鍙傛暟閿?/ 500 鏈嶅姟绔級銆俙api/client.ts` 缁熶竴鎷嗕俊灏侊紝402/403 閫氳繃娉ㄥ唽鍥炶皟璺宠浆锛岄伩鍏?router 涓?client 寰幆渚濊禆銆?2. **`/api/email/list` 鐨?`tag` 鏄€屽瓧绗︿覆鍖栫殑 JSON銆?*锛屽繀椤绘槸 `'{"type":0,"status":-1,"group_id":0}'` 杩欑褰㈠紡锛屼紶瀵硅薄浼氳闈欓粯蹇界暐銆?3. **鍚屼竴浠姐€岀敤鎴枫€嶆湁涓ゅ瀛楁鍚?*锛歚/api/login`銆乣/api/user/info` 鏄?`account/name/is_admin`锛坄is_admin` 鏄?int锛屼笉鏄?bool锛夛紝鑰?`/api/user/*` 鏄?PascalCase `ID/Account/Name/Disabled/IsAdmin`锛涘垱寤虹敤鎴风殑鏄剧ず鍚嶅瓧娈靛彨 `username`銆?4. **娌℃湁 SPA fallback**锛氬悗绔?`mux.Handle("/", http.FileServer(...))` 瀵规湭鐭ヨ矾寰勭洿鎺?404锛屾墍浠ョ敤 `HashRouter`锛屾繁閾炬帴涓嶄細 404銆?5. **闄勪欢涓婅鏄?base64 data URL**锛屽瓧娈靛悕 `attrs`锛堜笉鏄?`attachments`锛夛紱涓嬭鏄８鐩撮摼 `/attachments/download/{emailId}/{index}`锛屼笖鍚庣鎶?`Content-Type` 鎷兼垚浜?`ContentType`锛屽彧闈?`Content-Disposition` 鐢熸晥銆?6. **鎻掍欢璁剧疆椤佃繑鍥?HTML 涓嶆槸 JSON**锛屼笖鎻掍欢涓嶅瓨鍦ㄦ椂鏄┖ body锛屾墍浠ョ敤 iframe 宓岋紝骞跺仛浜嗗閿欍€?7. **姝ｆ枃 HTML 涓嶅彲淇?*锛歚lib/sanitize.ts` 浼氬墧闄?`script/iframe/object/embed/form` 涓庢墍鏈?`on*` 灞炴€с€乣javascript:` 鍗忚锛屽苟鎶?`cid:` 鍥剧墖鏀瑰啓鍒?`/attachments/{id}/{cid}`锛沗html` 涓虹┖鏃舵墠鍥為€€绾枃鏈苟鎸夋钀芥覆鏌撱€?8. **鍒犻櫎璇箟**锛氬湪銆屽凡鍒犻櫎銆嶉噷鍒犻櫎鎵嶆槸褰诲簳鍒犻櫎锛坄forcedDel=true`锛夛紝鍏跺畠鏂囦欢澶瑰垹闄ゅ彧鏄Щ鍏ュ凡鍒犻櫎銆?
## 宸茬煡闄愬埗锛堝悗绔病鏈夊搴旇兘鍔涳紝鍓嶇涓嶉€犲亣锛?
| 鎯冲仛鐨勫姛鑳?| 鐜扮姸 |
|---|---|
| 鏄熸爣 / 鏀惰棌 | 鍚庣 7 涓?model 閲屾病鏈変换浣?star/flag 瀛楁锛宍SearchTag` 鍙湁 `type/status/group_id`锛屾墍浠?*涓嶅仛** |
| 鏈 / 褰掓。绛夋櫤鑳芥枃浠跺す | 鍚屼笂锛屽垪琛ㄦ帴鍙ｄ笉鏀寔鎸夊凡璇昏繃婊?|
| 銆屼繚瀛樿崏绋裤€?| 鍚庣娌℃湁鍐欒崏绋跨殑鎺ュ彛锛坄user_email.status=4` 鍙兘鐢卞埆澶勪骇鐢燂級锛屽啓淇℃诞灞傚洜姝ゅ彧鏈夊彂閫?/ 涓㈠純 |
| 鍒犻櫎鐢ㄦ埛 | 鍚庣鍙湁 create / edit / list锛屾墍浠ャ€屽垹闄ゃ€嶆敼鎴愩€屽仠鐢ㄣ€嶏紙`disabled`锛?|
| 璁句负绠＄悊鍛?| `user/create|edit` 鐨勫叆鍙傞噷娌℃湁 `is_admin` 瀛楁锛岃〃鍗曢噷鍙繚鐣欎竴琛岃鏄庯紝涓嶅啀鏀惧瓨涓嶈繘鍘荤殑寮€鍏?|
| 绯荤粺璁剧疆璇诲啓 | 娌℃湁璇婚厤缃殑鎺ュ彛锛岃缃〉鍙仛鍙灞曠ず + 璇存槑銆屾敼 config.json 骞堕噸鍚€?|
| 閭欢鍒楄〃鐨勩€屾湭璇绘暟銆?| 鍒楄〃鎺ュ彛涓嶈繑鍥炴湭璇昏鏁帮紝鍙樉绀哄綋鍓嶉〉鏉℃暟 |

## 鏈湴 UI 鑱旇皟锛堜笉鍚姩鐪熷疄閭欢鏈嶅姟锛?
```bash
node tools/mock-api.mjs                                  # 鍋囧悗绔紝榛樿 127.0.0.1:18081
PMAIL_API=http://127.0.0.1:18081 pnpm --dir web dev      # 鍓嶇鎸囧悜瀹?# 鎯崇湅鐧诲綍椤靛氨鍘绘帀 MOCK_OPEN=1锛涙兂鐩存帴鐪嬪唴閮ㄩ〉闈㈠氨 MOCK_OPEN=1 node tools/mock-api.mjs
```

`tools/mock-api.mjs` 鎸夌湡瀹?handler 鐨勪俊灏佷笌瀛楁鍚嶈繑鍥炲亣鏁版嵁锛?*鍙敤浜庡紑鍙戝拰鎴浘锛屼笉浼氳鎵撹繘浜岃繘鍒?*銆?
## 楠岃瘉璁板綍

| 椤圭洰 | 缁撴灉 |
|---|---|
| `tsc -b`锛堝惈 `noUnusedLocals`锛?| 0 閿欒 |
| `vite build` | 1944 modules锛孋SS 47 KB / JS 987 KB锛坓zip 311 KB锛?|
| `go build`锛堝唴宓屽墠绔級 | 鎴愬姛锛屽崟鏂囦欢 18.4 MB |
| 瀹夎鍚戝锛堢湡瀹?Go 浜岃繘鍒讹級 | 娓叉煋姝ｅ父锛屼簲姝ユ祦绋嬪彲璧?|
| 鐧诲綍椤?/ 鏀朵欢绠变笁鏍?/ 鐢ㄦ埛绠＄悊 | 娓叉煋姝ｅ父锛屾鏂?XSS 琚竻娲椼€乣{count}` 鍗犱綅绗︿笌鏀朵欢浜?JSON 涓插潎姝ｇ‘鏄剧ず |
| 娣辫壊妯″紡 | 璧?`prefers-color-scheme` 鑷姩鍒囨崲锛屼笁鏍忓姣斿害姝ｅ父 |
| 绐勫睆锛?00px / 600px锛?| 渚ц竟鏍忔敹璧蜂负椤舵爮锛堝惈鏂囦欢澶逛笅鎷変笌鍐欓偖浠讹級锛屽垪琛ㄤ笌闃呰鍖哄垏鎹负鍗曟爮 + 杩斿洖鎸夐挳 |
| `docker build` | 鎴愬姛锛岄暅鍍?**40.7 MB**锛堝闃舵锛歯ode 鏋勫缓 鈫?go 缂栬瘧 鈫?alpine 杩愯锛?|
| `docker run` | 瀹瑰櫒鍐?`/api/ping` 杩斿洖 `{"errorNo":402}`锛堟湭瀹夎鎬佹纭級锛屽墠绔潤鎬佽祫婧愭甯镐笅鍙?|

> 鏈満 Docker Desktop 鐨勪竴涓皬鍧戯細鍙戝竷绔彛鍚?`127.0.0.1:绔彛` 杩炰笉涓婏紝浣?`localhost:绔彛` 姝ｅ父锛屽睘浜庡涓绘満绔彛杞彂灞傜殑闂锛屼笌闀滃儚鏃犲叧銆?
宸茬煡鏈仛鐨勶細鐪熸満鏀跺彂淇￠摼璺紙闇€瑕?25/993 绔彛涓庣湡瀹炲煙鍚嶈瘉涔︼級銆乣<768px` 鐨勬墜鍔?鎶藉眽寮忓鑸紙鐜板湪鏄《鏍忎笅鎷夛級銆?
## 涓嬩竴姝?
1. 鑱旂綉鍚?`pnpm install` 鈫?`pnpm typecheck` 鈫?`pnpm build`锛屼慨绗竴杞紪璇戦敊璇€?2. 璧锋湰鍦?Go 鏈嶅姟鍋氱湡鏈鸿仈璋冿紙鐧诲綍 鈫?鏀朵俊 鈫?璇讳俊 鈫?鍥炰俊 鈫?闄勪欢 鈫?绠＄悊鍚庡彴锛夈€?3. 绗簩闃舵锛氭寜绾﹀畾閲嶆瀯 Go 鍚庣锛堟媶 handler/service銆佽ˉ OpenAPI銆佽ˉ鏄熸爣涓庤崏绋胯兘鍔涖€佷慨 `ContentType` 鎷煎啓涓庢彃浠剁┖ body锛夈€?
