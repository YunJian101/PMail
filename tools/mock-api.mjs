/**
 * 本地 UI 联调用的假后端（仅用于开发/截图，不参与构建，也不会被打进二进制）。
 *
 *   node tools/mock-api.mjs            # 默认 18081
 *   PMAIL_API=http://127.0.0.1:18081 pnpm dev
 *
 * 它按真实 Go handler 的信封返回：{ errorNo, errorMsg, data }
 * 字段名也照抄后端（列表 sender 是 PascalCase、tag 是 JSON 字符串等）。
 */
import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 18081)
/** MOCK_OPEN=1 时跳过登录校验（方便直接截内部页面） */
const MOCK_OPEN = process.env.MOCK_OPEN === '1'

const sessionUser = {
  account: 'hi@example.com',
  name: '小小绘',
  is_admin: 1,
  domains: ['example.com', 'mail.example.com'],
}

const TAGS = {
  inbox: { type: 0, status: -1, group_id: 0 },
  sent: { type: 1, status: -1, group_id: 0 },
  drafts: { type: 0, status: 4, group_id: 0 },
  junk: { type: -1, status: 5, group_id: 0 },
  trash: { type: -1, status: 3, group_id: 0 },
  work: { type: -1, status: -1, group_id: 3 },
  bill: { type: -1, status: -1, group_id: 4 },
}

const folders = [
  { label: '收件箱', tag: JSON.stringify(TAGS.inbox) },
  { label: '发件箱', tag: JSON.stringify(TAGS.sent) },
  { label: '草稿箱', tag: JSON.stringify(TAGS.drafts) },
  { label: '垃圾邮件', tag: JSON.stringify(TAGS.junk) },
  { label: '已删除', tag: JSON.stringify(TAGS.trash) },
  { label: '工作', tag: JSON.stringify(TAGS.work) },
  { label: '账单', tag: JSON.stringify(TAGS.bill) },
]

const senders = [
  ['陈墨', 'chen.mo@acme.io'],
  ['GitHub', 'notifications@github.com'],
  ['云服务商账单中心', 'billing@cloud.example'],
  ['Lin Wei', 'lin.wei@example.com'],
  ['少数派', 'newsletter@sspai.com'],
  ['王思远', 'wang.sy@example.com'],
  ['Spamhaus', 'noreply@spamhaus.org'],
  ['Mail Tester', 'contact@mail-tester.com'],
  ['Acme 运维', 'ops@acme.io'],
  ['财务部', 'finance@example.com'],
]

const subjects = [
  '关于 Q3 基础设施扩容方案的确认',
  '[Jinnrry/PMail] 新的 issue #482',
  '9 月账单已生成：¥ 248.00',
  'Re: 域名迁移的 DNS 记录',
  '本周值得关注的 7 个自托管项目',
  '合同扫描件（已签章）',
  '你的 IP 段已从 PBL 中移除',
  'Your score: 10/10',
  '机房巡检报告（周报）',
  '10 月发票已开具',
]

const snippets = [
  '附件里是最终版报价单，机柜和带宽都按你上次说的口径算的，周四前给我个回话就行…',
  'IMAP IDLE 在部分客户端上会断开重连，想确认一下是不是预期行为…',
  '本期包含 2 台实例、1 个负载均衡与 320 GB 流量，账单明细见附件…',
  'MX 已经指过去了，SPF 记得把新 IP 加上，不然会掉分…',
  '从邮件服务器到照片管理，这一期全是能跑在自己机器上的东西…',
  '扫描件在附件里，纸质版下周一寄出，麻烦查收…',
  '此前的申诉已处理完成，投递成功率应该会恢复正常…',
  'SPF、DKIM、DMARC 全部通过，恭喜…',
  '本周巡检未发现异常，磁盘使用率 34%，风扇转速正常…',
  '发票已开具，请在附件中下载，如需专用发票请联系财务…',
]

const mails = Array.from({ length: 10 }).map((_, index) => {
  const [name, email] = senders[index]
  return {
    id: 100 - index,
    title: subjects[index],
    desc: snippets[index],
    datetime: `2026-10-${String(29 - index).padStart(2, '0')} ${String(9 + index).padStart(2, '0')}:41:00`,
    is_read: index > 2,
    sender: { Name: name, EmailAddress: email },
    to: [{ Name: '小小绘', EmailAddress: 'hi@example.com' }],
    dangerous: index === 1,
    error: index === 5 ? 'SMTP 550 mailbox unavailable' : '',
  }
})

const detailHtml = `
<div>
  <p>你好，</p>
  <p>附件里是最终版报价单，机柜和带宽都按你上次说的口径算的。整体比上一版降了约 8%，主要是把两台独立实例合并成了一套集群，运维也省事。</p>
  <h3>几个需要你拍板的点</h3>
  <ul>
    <li>机柜位置：B 区 3 排，离电力间近，走线方便，但夏天温度略高</li>
    <li>带宽：100M 独享，峰值可临时升到 300M，按小时计费</li>
    <li>备份：每周一次全量到对象存储，保留 30 天</li>
  </ul>
  <p>如果这些都 OK，周四前给我个回话，我这边就排进本月的交付计划。合同流程走电子签，一天就能下来。</p>
  <p>另外你之前提到的 IPv6 支持，这一批交换机是支持的，到时候一起配。</p>
  <p>祝好，<br>陈墨</p>
  <p><a href="https://example.com/quote">查看在线报价单</a></p>
  <script>alert('xss')</script>
</div>
`

const detail = {
  id: 100,
  type: 0,
  subject: subjects[0],
  reply_to: '',
  from_name: '陈墨',
  from_address: 'chen.mo@acme.io',
  to: '[{"Name":"小小绘","EmailAddress":"hi@example.com"}]',
  cc: '',
  bcc: '',
  text: '',
  html: detailHtml,
  sender: '{"Name":"陈墨","EmailAddress":"chen.mo@acme.io"}',
  attachments: [
    { Filename: 'Q3-扩容报价单-终版.pdf', ContentType: 'application/pdf', Index: 0 },
    { Filename: '机柜带宽测算表.xlsx', ContentType: 'application/vnd.ms-excel', Index: 1 },
    { Filename: '机房布局图.png', ContentType: 'image/png', Index: 2 },
  ],
  spf_check: 1,
  dkim_check: 1,
  status: 1,
  send_time: '2026-10-29 09:41:00',
  send_date: '2026-10-29 09:41:00',
  update_time: '2026-10-29 09:41:00',
  create_time: '2026-10-29 09:41:00',
  send_user_id: 1,
  size: 4404019,
  error: '',
  msg_id: '<mock@example.com>',
}

const users = [
  { ID: 1, Account: 'hi', Name: '小小绘', Disabled: 0, IsAdmin: 1 },
  { ID: 2, Account: 'chen.mo', Name: '陈墨', Disabled: 0, IsAdmin: 0 },
  { ID: 3, Account: 'wang.sy', Name: '王思远', Disabled: 0, IsAdmin: 0 },
  { ID: 4, Account: 'noreply', Name: 'noreply', Disabled: 0, IsAdmin: 0 },
  { ID: 5, Account: 'lin.wei', Name: 'Lin Wei', Disabled: 1, IsAdmin: 0 },
]

const rules = [
  {
    id: 1,
    user_id: 1,
    name: 'GitHub 通知归到工作',
    rules: [{ field: 'From', type: 'contains', rule: '@github.com' }],
    action: 4,
    params: '3',
    sort: 10,
  },
  {
    id: 2,
    user_id: 1,
    name: '账单加星并转发',
    rules: [{ field: 'Subject', type: 'regex', rule: '^(账单|invoice)' }],
    action: 2,
    params: 'finance@example.com',
    sort: 5,
  },
  {
    id: 3,
    user_id: 1,
    name: '退订邮件直接删除',
    rules: [{ field: 'Text', type: 'contains', rule: '退订' }],
    action: 3,
    params: '',
    sort: 1,
  },
]

function send(res, data, code = 200, errorNo = 0, errorMsg = '') {
  const body = JSON.stringify({ errorNo, errorMsg, data })
  res.writeHead(code, {
    'Content-Type': 'application/json;charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  const body = req.method === 'POST' ? await readBody(req) : {}
  const authed = MOCK_OPEN || /(?:^|;\s*)mock_session=1/.test(req.headers.cookie ?? '')

  if (path === '/api/ping') return send(res, '')
  if (path === '/api/user/info') {
    // 没登录时按后端约定返回 403，让前端跳到登录页
    if (!authed) return send(res, null, 200, 403)
    return send(res, sessionUser)
  }
  if (path === '/api/login') {
    if (!body.account || !body.password) return send(res, null, 200, 100)
    res.setHeader('Set-Cookie', 'mock_session=1; Path=/; Max-Age=86400')
    return send(res, sessionUser)
  }
  if (path === '/api/logout') {
    res.setHeader('Set-Cookie', 'mock_session=; Path=/; Max-Age=0')
    return send(res, 'Success')
  }
  if (path === '/api/group') return send(res, folders)
  if (path === '/api/group/list') {
    return send(res, [
      { id: 2000000000, name: '收件箱', parent_id: 0, full_path: '/' },
      { id: 2000000004, name: '垃圾邮件', parent_id: 0, full_path: '/' },
      { id: 2000000003, name: '已删除', parent_id: 0, full_path: '/' },
      { id: 3, name: '工作', parent_id: 0, full_path: '/工作' },
      { id: 4, name: '账单', parent_id: 0, full_path: '/账单' },
    ])
  }
  if (path === '/api/group/add') return send(res, 9)
  if (path === '/api/group/del') return send(res, true)

  if (path === '/api/email/list') {
    const page = Number(body.current_page || 1)
    const size = Number(body.page_size || 20)
    const start = (page - 1) * size
    return send(res, {
      current_page: page,
      total_page: Math.max(1, Math.ceil(mails.length / size)),
      list: mails.slice(start, start + size),
    })
  }
  if (path === '/api/email/detail') {
    const id = Number(body.id)
    const found = mails.find((mail) => mail.id === id)
    return send(res, { ...detail, id, subject: found ? found.title : detail.subject })
  }
  if (path === '/api/email/read') return send(res, 'success')
  if (path === '/api/email/del') return send(res, 'success')
  if (path === '/api/email/move') return send(res, 'success')
  if (path === '/api/email/send') return send(res, 'Succ')

  if (path === '/api/user/list') return send(res, { current_page: 1, total_page: 1, list: users })
  if (path === '/api/user/create' || path === '/api/user/edit') {
    return send(res, users[0])
  }
  if (path === '/api/rule/get') return send(res, rules)
  if (path === '/api/rule/add' || path === '/api/rule/update') return send(res, 'succ')
  if (path === '/api/rule/del') return send(res, 'succ')
  if (path === '/api/plugin/list') return send(res, ['wechat_push', 'spam_block'])
  if (path === '/api/email/unread') return send(res, { inbox: 3, sent: 0, drafts: 1, junk: 0, trash: 0 })
  if (path === '/api/version')
    return send(res, { version: '2.0.4beta', buildTime: '2026-10-30T13:50:00Z', gitHash: 'local', goVersion: 'go1.27.3' })
  if (path === '/api/settings/modify_password') return send(res, 'Succ')
  if (path === '/api/settings/ssl_info')
    return send(res, {
      domain: '*.example.dev',
      expire: '2027-01-27',
      daysLeft: 454,
      source: 'fnos',
      autoSync: true,
      lastSync: '2026-10-30 03:30',
      fnosRootOk: true,
    })
  if (path === '/api/settings/reload_cert')
    return send(res, { changed: false, domain: '*.example.dev', expire: '2027-01-27' })

  res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8' })
  res.end(JSON.stringify({ errorNo: 0, errorMsg: '', data: null }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock api on http://127.0.0.1:${PORT}`)
})
