package smtp_server

import (
	"database/sql"
	"errors"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/dto/parsemail"
	"github.com/Jinnrry/pmail/models"
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

	s.User = username

	var user models.User

	infos := strings.Split(username, "@")
	if len(infos) > 1 {
		username = infos[0]
	}

	// 分三步判断：账号存在 -> 密码正确 -> 没被停用（停用要给出明确原因）
	_, err := db.Instance.Where("account = ?", username).Get(&user)
	if err != nil && err != sql.ErrNoRows {
		log.Errorf("%+v", err)
	}

	if user.ID > 0 && password.Verify(pwd, user.Password) {
		if user.Disabled == 1 {
			log.WithContext(s.Ctx).Infof("auth rejected: account disabled %s", user.Account)
			return errors.New("account disabled, please contact the administrator")
		}

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

// Rcpt 只接受本域收件人。
//
// 以前什么都不校验：别人往「随便什么@别人的域名」发信也会被收下，
// 投递时发现本地没有这个账号，就转交给管理员，于是垃圾邮件和陌生人的信
// 全进了管理员信箱。
//
// 现在的策略：
//   - 收件域名不是自己的域名 → 550 Relaying denied（不替别人收信）
//   - 是自己的域名 → 一律 250 收下（不暴露账号是否存在，防用户枚举）
//     投递阶段发现账号不存在就静默丢弃，不退信、不转交
func (s *Session) Rcpt(to string, opts *smtp.RcptOptions) error {
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
