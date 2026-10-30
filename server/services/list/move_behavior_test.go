package list

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/Jinnrry/pmail/config"
	"github.com/Jinnrry/pmail/consts"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/dto"
	"github.com/Jinnrry/pmail/models"
	"github.com/Jinnrry/pmail/services/del_email"
	"github.com/Jinnrry/pmail/services/group"
	"github.com/Jinnrry/pmail/utils/context"
)

// 五个内置箱子的定义：移动函数用的名字 + 列表用的 tag + 老数据的 status/type
type boxDef struct {
	name      string
	tag       dto.SearchTag
	status    int8
	emailType int8
}

var allBoxes = []boxDef{
	{"INBOX", dto.SearchTag{Type: consts.EmailTypeReceive, Status: -1, GroupId: 0}, 0, 0},
	{"Sent Messages", dto.SearchTag{Type: consts.EmailTypeSend, Status: -1, GroupId: 0}, 1, 1},
	{"Drafts", dto.SearchTag{Type: 0, Status: consts.EmailStatusDrafts, GroupId: 0}, 4, 0},
	{"Junk", dto.SearchTag{Type: -1, Status: consts.EmailStatusJunk, GroupId: 0}, 5, 0},
	{"Deleted Messages", dto.SearchTag{Type: -1, Status: consts.EmailStatusDel, GroupId: 0}, 3, 0},
}

// 5×5 全矩阵：任何箱子移到任何箱子，都必须「目标有、其余四个箱子都没有」。
func TestMoveMatrixAllBoxes(t *testing.T) {
	for _, src := range allBoxes {
		for _, dst := range allBoxes {
			src, dst := src, dst
			t.Run(fmt.Sprintf("%s_to_%s", src.name, dst.name), func(t *testing.T) {
				ctx := newTestCtx(t)
				emailId := seedMail(t, ctx, src)

				if got := countList(ctx, src.tag); got != 1 {
					t.Fatalf("移动前 %s 应该有 1 封，实际 %d", src.name, got)
				}

				if err := group.Move2DefaultBox(ctx, []int{emailId}, dst.name); err != nil {
					t.Fatalf("move %s -> %s: %v", src.name, dst.name, err)
				}

				for _, b := range allBoxes {
					got := countList(ctx, b.tag)
					want := int64(0)
					if b.name == dst.name {
						want = 1
					}
					if got != want {
						t.Fatalf("移动到 %s 后，%s 应该有 %d 封，实际 %d", dst.name, b.name, want, got)
					}
				}
			})
		}
	}
}

// 从每个箱子删除：软删除只进「已删除」，彻底删除则五个箱子都没有
func TestDeleteFromEveryBox(t *testing.T) {
	for _, src := range allBoxes {
		src := src
		t.Run("soft_"+src.name, func(t *testing.T) {
			ctx := newTestCtx(t)
			emailId := seedMail(t, ctx, src)

			if err := del_email.DelEmail(ctx, []int{emailId}, false); err != nil {
				t.Fatalf("soft delete: %v", err)
			}

			for _, b := range allBoxes {
				got := countList(ctx, b.tag)
				want := int64(0)
				if b.name == "Deleted Messages" {
					want = 1
				}
				if got != want {
					t.Fatalf("%s 删除后，%s 应该有 %d 封，实际 %d", src.name, b.name, want, got)
				}
			}
		})

		t.Run("forced_"+src.name, func(t *testing.T) {
			ctx := newTestCtx(t)
			emailId := seedMail(t, ctx, src)

			if err := del_email.DelEmail(ctx, []int{emailId}, true); err != nil {
				t.Fatalf("forced delete: %v", err)
			}

			for _, b := range allBoxes {
				if got := countList(ctx, b.tag); got != 0 {
					t.Fatalf("%s 彻底删除后，%s 还有 %d 封", src.name, b.name, got)
				}
			}
		})
	}
}

// 标已读/标未读都不应该改变邮件所在箱子
func TestReadStateDoesNotMoveMail(t *testing.T) {
	for _, src := range allBoxes {
		src := src
		t.Run(src.name, func(t *testing.T) {
			ctx := newTestCtx(t)
			emailId := seedMail(t, ctx, src)

			// 等价于「打开邮件被标已读」：只改 is_read，不动 group_id/status
			if _, err := db.Instance.Exec("update user_email set is_read=0 where email_id=? and user_id=?", emailId, ctx.UserID); err != nil {
				t.Fatalf("mark unread: %v", err)
			}
			if got := countList(ctx, src.tag); got != 1 {
				t.Fatalf("标未读后 %s 应该还是 1 封，实际 %d", src.name, got)
			}

			if _, err := db.Instance.Exec("update user_email set is_read=1 where email_id=? and user_id=?", emailId, ctx.UserID); err != nil {
				t.Fatalf("mark read: %v", err)
			}
			if got := countList(ctx, src.tag); got != 1 {
				t.Fatalf("标已读后 %s 应该还是 1 封，实际 %d", src.name, got)
			}

			for _, b := range allBoxes {
				if b.name == src.name {
					continue
				}
				if got := countList(ctx, b.tag); got != 0 {
					t.Fatalf("改已读状态后 %s 不该出现，实际 %d", b.name, got)
				}
			}
		})
	}
}

func seedMail(t *testing.T, ctx *context.Context, b boxDef) int {
	t.Helper()

	email := &models.Email{Type: b.emailType, Subject: "matrix"}
	if _, err := db.Instance.Insert(email); err != nil {
		t.Fatalf("insert email: %v", err)
	}
	if _, err := db.Instance.Insert(&models.UserEmail{
		UserID: ctx.UserID, EmailID: email.Id, GroupId: 0, Status: b.status, IsRead: 1,
	}); err != nil {
		t.Fatalf("insert user_email: %v", err)
	}
	return email.Id
}

// 移到自定义分组后，内置箱子也不该再显示；自定义分组里能看到
func TestMoveToCustomGroupLeavesBuiltInBox(t *testing.T) {
	ctx := newTestCtx(t)

	custom := &models.Group{Name: "归档", ParentId: 0, UserId: ctx.UserID, FullPath: "归档"}
	if _, err := db.Instance.Insert(custom); err != nil {
		t.Fatalf("insert group: %v", err)
	}

	emailId := seedMail(t, ctx, allBoxes[0])

	if !group.MoveMailToGroup(ctx, []int{emailId}, custom.ID) {
		t.Fatal("move to custom group failed")
	}

	for _, b := range allBoxes {
		if got := countList(ctx, b.tag); got != 0 {
			t.Fatalf("移到自定义分组后 %s 不该显示，实际 %d", b.name, got)
		}
	}
	if got := countList(ctx, dto.SearchTag{Type: 0, Status: -1, GroupId: custom.ID}); got != 1 {
		t.Fatalf("自定义分组应该有 1 封，实际 %d", got)
	}
}

func countList(ctx *context.Context, tag dto.SearchTag) int64 {
	_, total := GetEmailList(ctx, tag, "", false, 0, 20)
	return total
}

func newTestCtx(t *testing.T) *context.Context {
	t.Helper()

	oldRoot := config.ROOT_PATH
	root := t.TempDir()
	config.ROOT_PATH = root
	if err := os.MkdirAll(filepath.Join(root, "config"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	dbPath := filepath.Join(root, "config", "pmail.db")
	cfg := config.Config{
		Domain: "test.domain", Domains: []string{"test.domain"}, WebDomain: "mail.test.domain",
		DbType: config.DBTypeSQLite, DbDSN: dbPath, SSLType: config.SSLTypeUser,
		SSLPrivateKeyPath: filepath.Join(root, "config", "ssl", "private.key"),
		SSLPublicKeyPath:  filepath.Join(root, "config", "ssl", "public.crt"),
		HttpsEnabled:      2, IsInit: true,
	}
	raw, _ := json.Marshal(cfg)
	if err := os.WriteFile(filepath.Join(root, "config", "config.json"), raw, 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	config.Init()
	if err := db.Init("test"); err != nil {
		t.Fatalf("db init: %v", err)
	}
	t.Cleanup(func() {
		if db.Instance != nil {
			_ = db.Instance.Close()
			db.Instance = nil
		}
		config.ROOT_PATH = oldRoot
	})

	ctx := &context.Context{}
	ctx.UserID = 1
	return ctx
}
