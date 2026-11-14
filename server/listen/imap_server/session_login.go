package imap_server

import (
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/services/auth"
	"github.com/Jinnrry/pmail/utils/password"
	"github.com/emersion/go-imap/v2"
	log "github.com/sirupsen/logrus"
)

func (s *serverSession) Login(username, pwd string) error {
	// 账号可能是纯账号（admin）也可能是完整地址（admin@example.com），两种都要认。
	// 以前这里会把 @ 后面砍掉再精确匹配，库里的账号若是完整地址就永远匹配不上。
	user, err := auth.FindUserByAccount(username)
	if err != nil {
		log.WithContext(s.ctx).Errorf("%+v", err)
	}
	if user == nil {
		user = &models.User{}
	}

	// 分三步判断：账号存在 -> 密码正确 -> 没被停用。
	// 这样被停用的账号在客户端能看到「account disabled」而不是笼统的认证失败。
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
