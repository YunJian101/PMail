package models

import "time"

type UserEmail struct {
	ID      int       `xorm:"id int unsigned not null pk autoincr"`
	UserID  int       `xorm:"user_id int not null index('idx_eid') index comment('用户id')"`
	EmailID int       `xorm:"email_id not null index('idx_eid') index comment('信件id')"`
	IsRead  int8      `xorm:"is_read tinyint(1) comment('是否已读')" json:"is_read"`
	GroupId int       `xorm:"group_id int notnull default(0) comment('分组id')'" json:"group_id"`
	Status  int8      `xorm:"status tinyint(4) notnull default(0) comment('0未发送或收件，1已发送，2发送失败，3删除 4草稿 5广告')" json:"status"` // 0未发送或收件，1已发送，2发送失败 3删除 4草稿箱(Drafts)  5骚扰邮件(Junk)
	// 删进「已删除」之前所在的箱子与状态，用来「原路退回」
	PrevGroupId int  `xorm:"prev_group_id int notnull default(0) comment('移入已删除前的分组id')" json:"prev_group_id"`
	PrevStatus  int8 `xorm:"prev_status tinyint(4) notnull default(-1) comment('移入已删除前的状态')" json:"prev_status"`
	Created     time.Time `xorm:"create datetime created index('idx_create_time')"`
}

func (p UserEmail) TableName() string {
	return "user_email"
}
