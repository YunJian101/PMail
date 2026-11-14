package smtp_server

import (
	"errors"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/dto/parsemail"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/services/auth"
	"github.com/Jinnrry/pmail/utils/array"
	"github.com/Jinnrry/pmail/utils/context"
	"github.com/Jinnrry/pmail/utils/id"
	"github.com/Jinnrry/pmail/utils/password"
	"github.com/emersion/go-sasl"
	"github.com/emersion/go-smtp"
	log "github.com/sirupsen/logrus"
	"net"
	"strings"
)

// The Backend implements SMTP server methods.
type Backend struct{}

func (bkd *Backend) NewSession(conn *smtp.Conn) (smtp.Session, error) {

	remoteAddress := conn.Conn().RemoteAddr()
	ctx := &context.Context{}
	ctx.SetValue(context.LogID, id.GenLogID())
	log.WithContext(ctx).Debugf("新SMTP连接")

	return &Session{
		RemoteAddress: remoteAddress,
		Ctx:           ctx,
	}, nil
}

// A Session is returned after EHLO.
type Session struct {
	RemoteAddress net.Addr
	User          string
	From          string
	To            []string
	Ctx           *context.Context
}

// AuthMechanisms returns a slice of available auth mechanisms
// supported in this example.
func (s *Session) AuthMechanisms() []string {
	return []string{sasl.Plain, sasl.Login}
}

// Auth is the handler for supported authenticators.
func (s *Session) Auth(mech string) (sasl.Server, error) {
	log.WithContext(s.Ctx).Debugf("Auth :%s", mech)
	if mech == sasl.Plain {
		return sasl.NewPlainServer(func(identity, username, password string) error {
			return s.AuthPlain(username, password)
		}), nil
	}

	if mech == sasl.Login {
		return NewLoginServer(func(username, password string) error {
			return s.AuthPlain(username, password)
		}), nil
	}

	return nil, errors.New("Auth Not Supported")
}

func (s *Session) AuthPlain(username, pwd string) error {
	log.WithContext(s.Ctx).Debugf("Auth %s %s", username, pwd)

	// 注意：不能在这里先给 s.User 赋值。
	// s.User 会被 Rcpt 用来判断"会话是否已认证"，若在验证密码前赋值，
	// 密码错误的会话也会被当成已登录 → 服务器变成开放中继。
	// 账号可能是纯账号也可能是完整地址，两种都要认
	// （以前把 @ 后面砍掉再精确匹配，库里存完整地址就永远登不上）
	user, err := auth.FindUserByAccount(username)
	if err != nil {
		log.WithContext(s.Ctx).Errorf("%+v", err)
	}
	if user == nil {
		user = &models.User{}
	}

	// 分三步判断：账号存在 -> 密码正确 -> 没被停用（停用要给出明确原因）
	if user.ID > 0 && password.Verify(pwd, user.Password) {
		if user.Disabled == 1 {
			log.WithContext(s.Ctx).Infof("auth rejected: account disabled %s", user.Account)
			return errors.New("account disabled, please contact the administrator")
		}

		s.User = username
		s.Ctx.UserAccount = user.Account
		s.Ctx.UserID = user.ID
		s.Ctx.UserName = user.Name
		s.Ctx.IsAdmin = user.IsAdmin == 1

		log.WithContext(s.Ctx).Debugf("Auth Success %+v", user)
		return nil
	}

	log.WithContext(s.Ctx).Debugf("登陆错误%s", username)
	return errors.New("password error")
}

func (s *Session) Mail(from string, opts *smtp.MailOptions) error {
	log.WithContext(s.Ctx).Debugf("Mail Success %+v %+v", from, opts)
	s.From = from
	return nil
}

// Rcpt 的收件人策略：
//
//   - 已认证用户（提交端口 465/587，登录过账号）→ 可以发给任意地址，
//     这是外发邮件的正常用法（博客、脚本用它发通知邮件都是这个场景）
//   - 未认证的入站会话（25 端口）→ 只接受本域收件人：
//     收件域名不是自己的域名就 550 Relaying denied（不替别人收信）；
//     是自己的域名一律 250 收下（不暴露账号是否存在，防用户枚举），
//     投递阶段发现账号不存在就转交管理员
func (s *Session) Rcpt(to string, opts *smtp.RcptOptions) error {
	// 登录过账号的会话按「外发」处理，收件人不受域名限制。
	// 以前这里不看认证状态，导致已认证用户也发不出外部邮件（550 relaying denied）。
	if s.isAuthenticated() {
		s.To = append(s.To, to)
		return nil
	}

	account := parsemail.BuilderUser(to)
	if account == nil {
		log.WithContext(s.Ctx).Infof("RCPT rejected (unparsable): %q", to)
		return &smtp.SMTPError{
			Code:         550,
			EnhancedCode: smtp.EnhancedCode{5, 1, 1},
			Message:      "recipient address rejected",
		}
	}

	_, domain := account.GetDomainAccount()
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" || !array.InArray(domain, localDomains()) {
		log.WithContext(s.Ctx).Infof("RCPT rejected (not a local domain): %s", to)
		return &smtp.SMTPError{
			Code:         550,
			EnhancedCode: smtp.EnhancedCode{5, 7, 1},
			Message:      "relaying denied",
		}
	}

	s.To = append(s.To, to)
	return nil
}

// isAuthenticated 判断这个会话是否已经通过 AUTH 登录。
// 只认 Ctx.UserID：它在密码验证通过之后才会被赋值，
// 而 s.User 在旧代码里验证前就写入了，拿它判断等于给开放中继开口子。
func (s *Session) isAuthenticated() bool {
	return s.Ctx != nil && s.Ctx.UserID > 0
}

// localDomains 返回本机负责的收件域名（小写）
func localDomains() []string {
	domains := make([]string, 0, len(config.Instance.Domains))
	for _, item := range config.Instance.Domains {
		item = strings.ToLower(strings.TrimSpace(item))
		if item != "" {
			domains = append(domains, item)
		}
	}
	return domains
}

func (s *Session) Reset() {}

func (s *Session) Logout() error {
	return nil
}

// senderMatchesAccount 比较「邮件 From 的本地部分」与「账号的本地部分」是否一致。
// 账号可能是纯账号（noreply）也可能是完整地址（noreply@example.com），
// 两者都按本地部分比较，且不区分大小写。
func senderMatchesAccount(fromAccount, userAccount string) bool {
	return strings.EqualFold(
		parsemail.LocalAccount(strings.TrimSpace(fromAccount)),
		parsemail.LocalAccount(strings.TrimSpace(userAccount)),
	)
}