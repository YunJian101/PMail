// Package mailstatus 记录各邮件协议端口的监听状态。
//
// 目的：端口被占用时不能把整个进程搞死（那样网页也打不开了，用户没地方改端口），
// 所以这里只登记失败原因，由设置页展示出来。
package mailstatus

import (
	"sort"
	"sync"
)

// State 一个邮件服务的监听状态
type State struct {
	Service string `json:"service"`
	Port    int    `json:"port"`
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
}

var (
	mu     sync.Mutex
	states = map[string]State{}
)

// Report 登记某个服务的监听结果（err 为 nil 表示监听成功）
func Report(service string, port int, err error) {
	mu.Lock()
	defer mu.Unlock()

	state := State{Service: service, Port: port, OK: err == nil}
	if err != nil {
		state.Error = err.Error()
	}
	states[service] = state
}

// Snapshot 按服务名排序返回当前状态
func Snapshot() []State {
	mu.Lock()
	defer mu.Unlock()

	ret := make([]State, 0, len(states))
	for _, item := range states {
		ret = append(ret, item)
	}
	sort.Slice(ret, func(i, j int) bool { return ret[i].Service < ret[j].Service })
	return ret
}

// Reset 清空记录（测试用）
func Reset() {
	mu.Lock()
	defer mu.Unlock()
	states = map[string]State{}
}
