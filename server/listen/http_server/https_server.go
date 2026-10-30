package http_server

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/controllers"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/dto/response"
	"github.com/Jinnrry/pmail/i18n"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/session"
	"github.com/Jinnrry/pmail/utils/context"
	"github.com/Jinnrry/pmail/utils/id"
	"github.com/Jinnrry/pmail/utils/password"
	olog "log"
	"net/http"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"
	"github.com/spf13/cast"
)

//go:embed dist/*
var local embed.FS

var httpsServer *http.Server

type nullWrite struct {
}

func (w *nullWrite) Write(p []byte) (int, error) {
	return len(p), nil
}

func HttpsStart() {

	mux := http.NewServeMux()

	router(mux)

	// go http server会打一堆没用的日志，写一个空的日志处理器，屏蔽掉日志输出
	nullLog := olog.New(&nullWrite{}, "", olog.Ldate)

	HttpsPort := 443
	if config.Instance.HttpsPort > 0 {
		HttpsPort = config.Instance.HttpsPort
	}

	if config.Instance.HttpsEnabled != 2 {
		log.Infof("Https Server Start On Port :%d", HttpsPort)
		httpsServer = &http.Server{
			Addr:         fmt.Sprintf(":%d", HttpsPort),
			Handler:      session.Instance.LoadAndSave(mux),
			ReadTimeout:  time.Second * 90,
			WriteTimeout: time.Second * 90,
			ErrorLog:     nullLog,
		}
		err := httpsServer.ListenAndServeTLS(config.Instance.SSLPublicKeyPath, config.Instance.SSLPrivateKeyPath)
		if err != nil {
			if errors.Is(err, http.ErrServerClosed) {
				// 正常关闭（重启或停机）
				log.Infof("Https Server closed normally on port :%d", HttpsPort)
			} else {
				// 异常错误仍然打印并退出
				log.Errorf("Https Server error on port :%d, %+v", HttpsPort, err)
				panic(err)
			}
		}
	}
}

func HttpsStop() {
	if httpsServer != nil {
		httpsServer.Close()
	}
}

// 新增：分类处理关闭错误

// 注入context
func contextIterceptor(h controllers.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", "application/json")
		}

		ctx := &context.Context{}
		ctx.Context = r.Context()
		ctx.SetValue(context.LogID, id.GenLogID())
		lang := r.Header.Get("Lang")
		if lang == "" {
			lang = "en"
		}
		ctx.Lang = lang

		if config.IsInit {
			user := cast.ToString(session.Instance.Get(ctx, "user"))
			var userInfo models.User
			if user != "" {
				_ = json.Unmarshal([]byte(user), &userInfo)
			}
			if userInfo.ID > 0 {
				// 会话里只信任 user id，名字/账号/管理员标记每次从库里读：
				// 否则改过显示名之后，用户自己的页面会一直显示登录时那个旧名字。
				var fresh models.User
				_, err := db.Instance.ID(userInfo.ID).Get(&fresh)
				if err != nil || fresh.ID == 0 {
					// 账号已被删除：会话立即失效，不等过期
					session.Instance.Clear(ctx.Context)
					response.NewErrorResponse(response.NeedLogin, i18n.GetText(ctx.Lang, "login_exp"), "").FPrint(w)
					return
				}
				if fresh.Disabled == 1 {
					// 账号已被停用：已登录的会话也要立刻失效
					session.Instance.Clear(ctx.Context)
					response.NewErrorResponse(response.NeedLogin, i18n.GetText(ctx.Lang, "account_disabled"), "").FPrint(w)
					return
				}
				ctx.UserID = fresh.ID
				ctx.UserName = fresh.Name
				ctx.UserAccount = fresh.Account
				ctx.IsAdmin = fresh.IsAdmin == 1
			}

			if userInfo.ID == 0 {
				token := r.Header.Get("Token")
				if token != "" {
					user, err := getLoginInfoByToken(token)
					if user.ID >= 0 && err == nil {
						ctx.UserID = user.ID
						ctx.UserName = user.Name
						ctx.UserAccount = user.Account
						ctx.IsAdmin = user.IsAdmin == 1
					} else {
						response.NewErrorResponse(response.NeedLogin, err.Error(), "").FPrint(w)
						return
					}
				}
			}

			if ctx.UserID == 0 {
				if r.URL.Path != "/api/ping" && r.URL.Path != "/api/login" {
					response.NewErrorResponse(response.NeedLogin, i18n.GetText(ctx.Lang, "login_exp"), "").FPrint(w)
					return
				}
			}
		} else if r.URL.Path != "/api/setup" {
			response.NewErrorResponse(response.NeedSetup, "", "").FPrint(w)
			return
		}
		h(ctx, w, r)
	}
}

/*
Token 格式：  {account}:md5(md5(md5(password+"pmail")+"pmail2023")+{Unix timestamp}):{Unix timestamp}
比如：         admin::
*/
func getLoginInfoByToken(token string) (models.User, error) {
	ret := models.User{}
	data := strings.Split(token, ":")
	if len(data) != 3 {
		return ret, errors.New("token format error")
	}
	account := data[0]
	encodePwd := data[1]
	requestTimeStamp := cast.ToInt64(data[2])
	if time.Now().Unix()-requestTimeStamp >= 5 {
		return ret, errors.New("token expired")
	}
	var user models.User
	db.Instance.Table("user").Where("account = ?", account).Get(&user)
	if user.ID == 0 {
		return ret, errors.New("account or password error")
	}
	if user.Disabled == 1 {
		return ret, errors.New("account disabled, please contact the administrator")
	}
	tokenPwd := password.Md5Encode(fmt.Sprintf("%s%d", user.Password, requestTimeStamp))
	if tokenPwd != encodePwd {
		return ret, errors.New("account or password error")
	}

	return user, nil
}
