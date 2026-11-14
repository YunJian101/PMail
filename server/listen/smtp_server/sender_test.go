package smtp_server

import (
	"testing"

	"github.com/Jinnrry/pmail/dto/parsemail"
)

// 发件人身份校验只比本地部分：账号字段可能是纯账号，也可能是完整地址。
// 以前直接拿 "noreply" 跟 "noreply@example.com" 比，非管理员永远被判无权限。
func TestSenderMatchesAccount(t *testing.T) {
	cases := []struct {
		from    string
		account string
		want    bool
	}{
		{"noreply", "noreply@example.com", true},
		{"noreply@example.com", "noreply@example.com", true},
		{"noreply", "noreply", true},
		{"NoReply", "noreply@example.com", true},
		{" other ", "noreply@example.com", false},
		{"", "noreply@example.com", false},
	}

	for _, c := range cases {
		if got := senderMatchesAccount(c.from, c.account); got != c.want {
			t.Fatalf("senderMatchesAccount(%q, %q) = %v，期望 %v", c.from, c.account, got, c.want)
		}
	}
}

// 顺手确认 parsemail.LocalAccount 的行为符合预期（上面函数依赖它）
func TestLocalAccountHelper(t *testing.T) {
	if got := parsemail.LocalAccount("noreply@example.com"); got != "noreply" {
		t.Fatalf("LocalAccount 结果不对：%q", got)
	}
}
