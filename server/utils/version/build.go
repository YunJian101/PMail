package version

import "runtime"

// 这几个变量由构建脚本用 -ldflags -X 注入（见 tools/build-fpk.ps1）。
// 放在这里而不是 main 包，是为了让 HTTP 层也能读到（/api/version）。
var (
	Version   string // 例如 2.0.4beta
	BuildTime string // 构建时间
	GitHash   string // 提交短哈希，本地构建为 local
)

// Info 返回给前端的版本信息
func Info() map[string]string {
	v := Version
	if v == "" {
		v = "dev"
	}
	hash := GitHash
	if hash == "" {
		hash = "local"
	}
	return map[string]string{
		"version":   v,
		"buildTime": BuildTime,
		"gitHash":   hash,
		"goVersion": runtime.Version(),
	}
}
