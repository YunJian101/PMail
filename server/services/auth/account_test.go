package auth

import (
	"testing"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/models"
	"xorm.io/xorm"
)

func newTestEngine(t *testing.T) *xorm.Engine {
	t.Helper()
	engine, err := xorm.NewEngine("sqlite", "file:"+t.Name()+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("创建测试数据库失败：%v", err)
	}
	engine.SetMaxOpenConns(1)
	if err = engine.Sync2(&models.User{}); err != nil {
		t.Fatalf("初始化测试数据库失败：%v", err)
	}
	t.Cleanup(func() { _ = engine.Close() })
	return engine
}

func setup(t *testing.T, accounts ...string) {
	t.Helper()
	engine := newTestEngine(t)

	oldDB := db.Instance
	t.Cleanup(func() { db.Instance = oldDB })
	db.Instance = engine

	oldConfig := config.Instance
	t.Cleanup(func() { config.Instance = oldConfig })
	config.Instance = &config.Config{Domain: "example.com", Domains: []string{"example.com", "mail.example.com"}}

	for _, account := range accounts {
		if _, err := engine.Insert(&models.User{Account: account, Name: account, Password: "x"}); err != nil {
			t.Fatalf("插入账号 %s 失败：%v", account, err)
		}
	}
}

// 库里的账号是完整地址时，客户端用完整地址或纯账号登录都要能查到
func TestFindUserByAccountFullAddressStored(t *testing.T) {
	setup(t, "noreply@example.com")

	for _, input := range []string{"noreply@example.com", "noreply", "Noreply@Example.com", " noreply "} {
		user, err := FindUserByAccount(input)
		if err != nil {
			t.Fatalf("查询 %q 出错：%v", input, err)
		}
		if user == nil || user.Account != "noreply@example.com" {
			t.Fatalf("输入 %q 应该匹配到 noreply@example.com，实际 %+v", input, user)
		}
	}
}

// 库里的账号是纯账号时，客户端用完整地址登录也要能查到
func TestFindUserByAccountLocalStored(t *testing.T) {
	setup(t, "admin")

	for _, input := range []string{"admin", "admin@example.com", "admin@mail.example.com"} {
		user, err := FindUserByAccount(input)
		if err != nil {
			t.Fatalf("查询 %q 出错：%v", input, err)
		}
		if user == nil || user.Account != "admin" {
			t.Fatalf("输入 %q 应该匹配到 admin，实际 %+v", input, user)
		}
	}
}

func TestFindUserByAccountNotFound(t *testing.T) {
	setup(t, "admin")

	for _, input := range []string{"", "  ", "nobody", "nobody@example.com", "nobody@other.com"} {
		user, err := FindUserByAccount(input)
		if err != nil {
			t.Fatalf("查询 %q 出错：%v", input, err)
		}
		if user != nil {
			t.Fatalf("输入 %q 不该匹配到任何账号，实际 %+v", input, user)
		}
	}
}
