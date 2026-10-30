package password

import "testing"

func TestVerify(t *testing.T) {
	encoded := Encode("Passw0rd!e2e")

	if !Verify("Passw0rd!e2e", encoded) {
		t.Fatal("correct password should verify")
	}
	if Verify("wrong-password", encoded) {
		t.Fatal("wrong password must not verify")
	}
	if Verify("Passw0rd!e2e", "") {
		t.Fatal("empty hash must not verify")
	}
	// 固定盐：同一密码每次编码结果一致（老数据不用迁移）
	if Encode("Passw0rd!e2e") != encoded {
		t.Fatal("encode should be deterministic")
	}
}
