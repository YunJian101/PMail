package group

import (
	"testing"

	"github.com/Jinnrry/pmail/consts"
	"github.com/Jinnrry/pmail/db"
	"github.com/Jinnrry/pmail/models"
)

// 移动规则：收到的邮件不能进发件箱/草稿箱，发出的不能进收件箱/垃圾箱
func TestCheckMoveTarget(t *testing.T) {
	receive := consts.EmailTypeReceive
	send := consts.EmailTypeSend

	cases := []struct {
		name      string
		emailType int8
		status    int8
		toBox     int
		allow     bool
	}{
		{"收件->发件箱", receive, 0, models.Sent, false},
		{"收件->收件箱", receive, 0, models.INBOX, true},
		{"收件->垃圾箱", receive, 0, models.Junk, true},
		{"收件->草稿箱", receive, 0, models.Drafts, false},
		{"收件->已删除", receive, 0, models.Deleted, true},

		{"发件->收件箱", send, 1, models.INBOX, false},
		{"发件->发件箱", send, 1, models.Sent, true},
		{"发件->垃圾箱", send, 1, models.Junk, false},
		{"发件->草稿箱", send, 1, models.Drafts, true},
		{"发件->已删除", send, 1, models.Deleted, true},

		// 本来就是草稿的邮件，可以留在草稿箱
		{"草稿->草稿箱", receive, consts.EmailStatusDrafts, models.Drafts, true},
		// 自定义分组不限制
		{"收件->自定义分组", receive, 0, 12, true},
		{"发件->自定义分组", send, 1, 12, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := CheckMoveTarget(tc.emailType, tc.status, tc.toBox)
			if tc.allow && err != nil {
				t.Fatalf("应该允许，却报错：%v", err)
			}
			if !tc.allow && err == nil {
				t.Fatal("应该拒绝，却通过了")
			}
		})
	}
}

// 删除后要能原路退回（包括从自定义分组删掉的）
func TestRestoreFromDeleted(t *testing.T) {
	ctx := newGroupTestCtx(t)

	custom := &models.Group{Name: "归档", ParentId: 0, UserId: ctx.UserID, FullPath: "归档"}
	if _, err := db.Instance.Insert(custom); err != nil {
		t.Fatalf("insert group: %v", err)
	}

	cases := []struct {
		name      string
		emailType int8
		groupID   int
		status    int8
	}{
		{"从收件箱删除", consts.EmailTypeReceive, 0, 0},
		{"从发件箱删除", consts.EmailTypeSend, models.Sent, 1},
		{"从自定义分组删除", consts.EmailTypeReceive, custom.ID, 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			email := &models.Email{Type: tc.emailType, Subject: tc.name}
			if _, err := db.Instance.Insert(email); err != nil {
				t.Fatalf("insert email: %v", err)
			}
			if _, err := db.Instance.Insert(&models.UserEmail{
				UserID: ctx.UserID, EmailID: email.Id, GroupId: tc.groupID, Status: tc.status, IsRead: 1,
			}); err != nil {
				t.Fatalf("insert user_email: %v", err)
			}

			if err := Move2DefaultBox(ctx, []int{email.Id}, "Deleted Messages"); err != nil {
				t.Fatalf("move to trash: %v", err)
			}

			var inTrash models.UserEmail
			if _, err := db.Instance.Where("email_id=? and user_id=?", email.Id, ctx.UserID).Get(&inTrash); err != nil {
				t.Fatalf("reload: %v", err)
			}
			if inTrash.GroupId != models.Deleted {
				t.Fatalf("应该在已删除箱，实际 group_id=%d", inTrash.GroupId)
			}
			if inTrash.PrevGroupId != tc.groupID {
				t.Fatalf("来源箱子应该记成 %d，实际 %d", tc.groupID, inTrash.PrevGroupId)
			}

			if err := RestoreFromDeleted(ctx, []int{email.Id}); err != nil {
				t.Fatalf("restore: %v", err)
			}

			var restored models.UserEmail
			if _, err := db.Instance.Where("email_id=? and user_id=?", email.Id, ctx.UserID).Get(&restored); err != nil {
				t.Fatalf("reload: %v", err)
			}
			if restored.GroupId != tc.groupID {
				t.Fatalf("应该退回 group_id=%d，实际 %d", tc.groupID, restored.GroupId)
			}
			if restored.Status != tc.status {
				t.Fatalf("状态应该恢复成 %d，实际 %d", tc.status, restored.Status)
			}
		})
	}
}
