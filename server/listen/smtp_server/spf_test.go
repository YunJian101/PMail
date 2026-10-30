package smtp_server

import (
	"testing"

	"github.com/Jinnrry/pmail/dto/parsemail"
)

// SPF 判定不该在「拿不到发件地址」「内网来源」「地址解析失败」时误报失败。
func TestSpfCheckDoesNotFalseAlarm(t *testing.T) {
	cases := []struct {
		name       string
		remote     string
		sender     *parsemail.User
		senderStr  string
		wantResult bool
	}{
		{
			name:       "内网来源直接通过",
			remote:     "10.0.0.5:12345",
			sender:     &parsemail.User{EmailAddress: "a@b.com"},
			senderStr:  "a@b.com",
			wantResult: true,
		},
		{
			name:       "没有 Sender 头（空地址）不判失败",
			remote:     "8.8.8.8:25",
			sender:     &parsemail.User{},
			senderStr:  "",
			wantResult: true,
		},
		{
			name:       "来源地址解析不了不判失败",
			remote:     "not-an-address",
			sender:     &parsemail.User{EmailAddress: "a@b.com"},
			senderStr:  "a@b.com",
			wantResult: true,
		},
		{
			name:       "sender 为 nil 但有兜底地址时不 panic",
			remote:     "10.0.0.5:12345",
			sender:     nil,
			senderStr:  "a@b.com",
			wantResult: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := spfCheck(tc.remote, tc.sender, tc.senderStr)
			if got != tc.wantResult {
				t.Fatalf("spfCheck 结果应该是 %v，实际 %v", tc.wantResult, got)
			}
		})
	}
}
