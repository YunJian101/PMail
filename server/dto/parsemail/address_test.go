package parsemail

import "testing"

func TestMailAddress(t *testing.T) {
	cases := []struct{ account, domain, want string }{
		{"user", "example.com", "user@example.com"},
		{"user@example.com", "example.com", "user@example.com"}, // 已带域名不能拼两次
		{" user ", " example.com ", "user@example.com"},
		{"", "example.com", ""},
		{"user", "", "user"},
	}
	for _, c := range cases {
		if got := MailAddress(c.account, c.domain); got != c.want {
			t.Fatalf("MailAddress(%q, %q) = %q，期望 %q", c.account, c.domain, got, c.want)
		}
	}
}

func TestLocalAccount(t *testing.T) {
	cases := map[string]string{
		"user@example.com": "user",
		"user":          "user",
		"":               "",
	}
	for in, want := range cases {
		if got := LocalAccount(in); got != want {
			t.Fatalf("LocalAccount(%q) = %q，期望 %q", in, got, want)
		}
	}
}