package password

import (
	"crypto/md5"
	"encoding/hex"
)

// Encode 对密码两次md5加盐
func Encode(password string) string {
	encodePwd := Md5Encode(Md5Encode(password+"pmail") + "pmail2023")
	return encodePwd
}

// Verify 校验明文密码与库里存的摘要是否匹配。
// 因为盐是固定的，直接重算比对即可（不需要改数据格式）。
func Verify(raw, encoded string) bool {
	if encoded == "" {
		return false
	}
	return Encode(raw) == encoded
}

func Md5Encode(str string) string {
	h := md5.New()
	h.Write([]byte(str))
	return hex.EncodeToString(h.Sum(nil))
}
