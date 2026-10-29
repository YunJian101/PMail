package pop3_server

import (
	"bytes"
	"fmt"
	"github.com/Jinnrry/gopop"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/utils/context"
	"github.com/emersion/go-message/mail"
	"io"
	"testing"
)

func Test_action_Retr(t *testing.T) {
	// go test 的测试二进制在临时目录里，config.init() 会把 ROOT_PATH 定到那儿，
	// 但用例要的是 server/config 下那份配置，所以这里指回仓库里的 server 目录。
	config.ROOT_PATH = "../../"
	config.Init()
	config.Instance.DbType = config.DBTypeSQLite
	config.Instance.DbDSN = config.ROOT_PATH + "./config/pmail_temp.db"
	db.Init("")

	a := action{}
	session := &gopop.Session{
		Ctx: &context.Context{
			UserID: 1,
		},
	}
	got, got1, err := a.Retr(session, 301)

	_, _, _ = got, got1, err
}

func Test_email(t *testing.T) {
	var b bytes.Buffer

	// Create our mail header
	var h mail.Header

	// Create a new mail writer
	mw, _ := mail.CreateWriter(&b, h)

	// Create a text part
	tw, _ := mw.CreateInline()

	var html mail.InlineHeader

	html.Header.Set("Content-Transfer-Encoding", "base64")
	w, _ := tw.CreatePart(html)

	io.WriteString(w, "=")

	w.Close()

	tw.Close()

	fmt.Printf("%s", b.String())

}
