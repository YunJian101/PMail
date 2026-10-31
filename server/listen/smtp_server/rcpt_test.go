package smtp_server

import (
	"testing"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/consts"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/dto/parsemail"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/utils/context"
	"github.com/emersion/go-smtp"
)

// RCPT 只接受本域收件人：外域一律 550（不替别人收信）；
// 本域一律接受，不暴露账号是否存在。
func TestRcptOnlyAcceptsLocalDomain(t *testing.T) {
	oldConfig := config.Instance
	t.Cleanup(func() { config.Instance = oldConfig })
	config.Instance = &config.Config{
		Domain:  "example.com",
		Domains: []string{"example.com", "Mail.example.com"},
	}

	session := &Session{Ctx: &context.Context{}}

	// 本域：存在和不存在的账号都要接受（防用户枚举）
	for _, to := range []string{"admin@example.com", "nobody@example.com", "someone@mail.example.com"} {
		if err := session.Rcpt(to, nil); err != nil {
			t.Fatalf("本域收件人 %s 应该被接受，实际报错：%v", to, err)
		}
	}

	// 外域：550 relaying denied
	for _, to := range []string{"xxx@yopmail.com", "a@gmail.com", "post@other-domain.cn"} {
		err := session.Rcpt(to, nil)
		if err == nil {
			t.Fatalf("外域收件人 %s 应该被拒绝", to)
		}
		smtpErr, ok := err.(*smtp.SMTPError)
		if !ok {
			t.Fatalf("应该返回 SMTPError，实际 %T", err)
		}
		if smtpErr.Code != 550 {
			t.Fatalf("外域应该回 550，实际 %d", smtpErr.Code)
		}
	}

	// 解析不出域名的地址也拒绝
	if err := session.Rcpt("not-an-address", nil); err == nil {
		t.Fatal("无法解析的地址应该被拒绝")
	}
}

// 本地不存在的收件人：静默丢弃，不再转交管理员
func TestUnknownRecipientIsDroppedNotForwarded(t *testing.T) {
	engine := newAuthenticationTestEngine(t)

	oldDB := db.Instance
	t.Cleanup(func() { db.Instance = oldDB })
	db.Instance = engine

	oldConfig := config.Instance
	t.Cleanup(func() { config.Instance = oldConfig })
	config.Instance = &config.Config{
		Domain:  "test.domain",
		Domains: []string{"test.domain"},
	}

	// 管理员是存在的，但收件人不是他
	if _, err := engine.Insert(&models.User{Account: "admin", Name: "admin", IsAdmin: 1}); err != nil {
		t.Fatalf("创建管理员失败：%v", err)
	}

	email := &parsemail.Email{From: &parsemail.User{EmailAddress: "sender@example.com"}}
	users, dropped, err := resolveIncomingUsers(
		&context.Context{},
		email,
		int(consts.EmailTypeReceive),
		[]string{"nobody@test.domain"},
		true,
		true,
	)
	if err != nil {
		t.Fatalf("解析收件人失败：%v", err)
	}
	if !dropped {
		t.Fatal("未知收件人应该被丢弃")
	}
	if len(users) != 0 {
		t.Fatalf("不该再转交管理员，实际得到 %d 个收件人", len(users))
	}
}
