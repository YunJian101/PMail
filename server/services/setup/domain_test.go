package setup

import "testing"

func TestNormalizeMailDomain(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"example.com", "example.com"},
		{"Example.COM", "example.com"},
		{"  example.com.  ", "example.com"},
		// 误填成主机名的情况：去掉一层前缀
		{"smtp.example.com", "example.com"},
		{"SMTP.Example.com", "example.com"},
		{"imap.example.com", "example.com"},
		{"pop3.example.com", "example.com"},
		{"submission.example.com", "example.com"},
		{"webmail.example.com", "example.com"},
		// 去掉前缀后不是合法域名 -> 保持原样（避免把 example.com 误伤成 com）
		{"smtp.com", "smtp.com"},
		// 不带点的主机名保持原样，交给校验去拦
		{"smtp", "smtp"},
		{"", ""},
	}

	for _, tc := range cases {
		if got := NormalizeMailDomain(tc.in); got != tc.want {
			t.Fatalf("NormalizeMailDomain(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestIsValidHostname(t *testing.T) {
	valid := []string{"example.com", "mail.example.com", "a-b.example.co", "x1.y2.example.com"}
	for _, host := range valid {
		if !IsValidHostname(host) {
			t.Fatalf("IsValidHostname(%q) should be true", host)
		}
	}

	invalid := []string{
		"", "localhost", "example", "exa mple.com", "-bad.com", "bad-.com",
		"example.c0m", "例子.中国", "example..com", ".example.com",
	}
	for _, host := range invalid {
		if IsValidHostname(host) {
			t.Fatalf("IsValidHostname(%q) should be false", host)
		}
	}
}
