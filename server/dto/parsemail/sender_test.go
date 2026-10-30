package parsemail

import (
	"strings"
	"testing"
)

// 空头必须返回 nil，否则「Sender 为空退回 From」的兜底会失效，
// 进而让 SPF 拿不到发件域名（线上就是因此把所有来信标成"内容不安全"）。
func TestBuildUserEmptyReturnsNil(t *testing.T) {
	if got := buildUser(""); got != nil {
		t.Fatalf("buildUser(\"\") 应该返回 nil，实际 %+v", got)
	}
	if got := buildUser("   "); got != nil {
		t.Fatalf("buildUser(\"   \") 应该返回 nil，实际 %+v", got)
	}
}

// 没有 Sender 头的邮件，Sender 要退回 From
func TestSenderFallsBackToFrom(t *testing.T) {
	raw := strings.Join([]string{
		"From: Lin Wei <lin.wei@example.com>",
		"To: hi@example.com",
		"Subject: hello",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"body",
	}, "\r\n")

	email := NewEmailFromReader([]string{"hi@example.com"}, strings.NewReader(raw), len(raw))

	if email.From == nil || email.From.EmailAddress != "lin.wei@example.com" {
		t.Fatalf("From 解析不对：%+v", email.From)
	}
	if email.Sender == nil {
		t.Fatal("Sender 不该为 nil（应退回 From）")
	}
	if email.Sender.EmailAddress != "lin.wei@example.com" {
		t.Fatalf("Sender 应该退回 From，实际 %q", email.Sender.EmailAddress)
	}
}
