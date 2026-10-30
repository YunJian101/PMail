package imap_server

import (
	"database/sql"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/utils/errors"
	"github.com/Jinnrry/pmail/utils/password"
	"github.com/emersion/go-imap/v2"
	log "github.com/sirupsen/logrus"
	"strings"
)

func (s *serverSession) Login(username, pwd string) error {
	if strings.Contains(username, "@") {
		args := strings.Split(username, "@")
		username = args[0]
	}

	var user models.User

	// 分三步判断：账号存在 -> 密码正确 -> 没被停用。
	// 这样被停用的账号在客户端能看到「account disabled」而不是笼统的认证失败。
	_, err := db.Instance.Where("account = ?", username).Get(&user)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		log.WithContext(s.ctx).Errorf("%+v", err)
	}

	if user.ID > 0 && password.Verify(pwd, user.Password) {
		if user.Disabled == 1 {
			log.WithContext(s.ctx).Infof("login rejected: account disabled")
			return &imap.Error{
				Type: imap.StatusResponseTypeNo,
				Code: imap.ResponseCodeAuthenticationFailed,
				Text: "Account disabled, please contact the administrator",
			}
		}

		s.status = AUTHORIZED

		s.ctx.UserID = user.ID
		s.ctx.UserName = user.Name
		s.ctx.UserAccount = user.Account
		log.WithContext(s.ctx).Debug("Login successful")

		return nil
	}

	log.WithContext(s.ctx).Info("user not found")
	return &imap.Error{
		Type: imap.StatusResponseTypeNo,
		Code: imap.ResponseCodeAuthenticationFailed,
		Text: "Invalid credentials (Failure)",
	}
}
