import * as React from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, RefreshCw, X } from 'lucide-react'
import { ApiError, get, post } from '@/api/client'
import { cn } from '@/lib/utils'
import { toast, errorText } from '@/lib/toast'
import { useSession } from '@/store/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty'
import { PageLoading, Spinner } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'

/**
 * 安装接口只有一个入口：POST /api/setup，靠 {action, step} 分流。
 * 依据 pmail-src/server/controllers/setup.go：
 *   get      + database | password | domain | dns | ssl
 *   set      + database | password | domain | ssl
 *   getParams + ssl（DNS 挑战需要添加的记录）
 * 后端把 body 反序列化成 map[string]string，所以所有值都必须是字符串。
 */
type SetupStep = 'domain' | 'dns' | 'database' | 'ssl' | 'admin'

const STEPS: SetupStep[] = ['domain', 'dns', 'database', 'ssl', 'admin']

interface DbConfig {
  db_type: string
  db_dsn: string
}

interface DomainConfig {
  web_domain: string
  smtp_domain: string
  domains: string[] | null
}

interface SslConfig {
  /** "0" 自动 + HTTP 挑战、"1" 用户证书、"2" 自动 + DNS 挑战 */
  type: string
  port: number
}

interface DnsRecord {
  host: string
  type: string
  value: string
  ttl?: number | string
  tips?: string
}

type DnsInfo = Record<string, DnsRecord[]>

type DnsStatus = 'ok' | 'pending' | 'missing'

/** 证书签发进度：后端 action=status 的返回 */
interface CertStatus {
  state: 'idle' | 'running' | 'need_txt' | 'ok' | 'ok_fallback' | 'failed'
  records?: DnsRecord[]
  error?: string
}

const DNS_STATUS: Record<DnsStatus, { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
  // PMail 后端不做 DNS 探测，所以这里不假装知道「已生效」，只提示去核对
  ok: { tone: 'neutral', label: 'setup.dns.verify' },
  pending: { tone: 'neutral', label: 'setup.dns.verify' },
  missing: { tone: 'neutral', label: 'setup.dns.missing' },
}

function setupPost<T>(payload: Record<string, string>, timeout = 60_000) {
  return post<T>('/api/setup', payload, { timeout })
}

/**
 * 安装完成后 setup 服务会立刻关闭、正式服务再启动，中间有几秒空窗。
 * 轮询 /api/ping 直到返回 errorNo=0（已安装）再继续。
 */
async function waitInstalled(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await get<string>('/api/ping')
      return true
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  return false
}

/** 后端没有逐条记录的检测结果，只能按「值是否为空 + 是否刚重新拉取过」推断状态 */
function recordStatus(record: DnsRecord, rechecked: boolean): DnsStatus {
  if (!record.value) return 'missing'
  return rechecked ? 'ok' : 'pending'
}

function CardHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[16px] font-[600] tracking-[-0.01em]">{title}</h2>
      {desc ? <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">{desc}</p> : null}
    </div>
  )
}

function ModeOption({
  active,
  title,
  onSelect,
}: {
  active: boolean
  title: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
        active ? 'border-primary bg-primary-soft' : 'border-border-base bg-surface-2 hover:bg-surface-3',
      )}
    >
      <span
        className={cn(
          'grid h-4 w-4 flex-none place-items-center rounded-full border-2',
          active ? 'border-primary' : 'border-border-strong',
        )}
      >
        {active ? <span className="h-[7px] w-[7px] rounded-full bg-primary" /> : null}
      </span>
      <span className={cn('text-[13px] font-[600]', active ? 'text-primary' : 'text-fg')}>{title}</span>
    </button>
  )
}

export default function SetupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loadSession = useSession((state) => state.load)

  const [phase, setPhase] = React.useState<'probing' | 'ready' | 'installed'>('probing')
  const [step, setStep] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const probed = React.useRef(false)

  // 第 1 步：域名
  const [webDomain, setWebDomain] = React.useState('')
  const [smtpDomain, setSmtpDomain] = React.useState('')
  const [extraDomains, setExtraDomains] = React.useState<string[]>([])

  // 第 2 步：DNS
  const [dnsInfos, setDnsInfos] = React.useState<DnsInfo>({})
  const [dnsLoading, setDnsLoading] = React.useState(false)
  const [dnsRechecked, setDnsRechecked] = React.useState(false)

  // 第 3 步：数据库
  const [dbType, setDbType] = React.useState<'sqlite' | 'mysql'>('sqlite')
  const [dbDsn, setDbDsn] = React.useState('./config/pmail.db')
  const [dbError, setDbError] = React.useState('')

  // 第 4 步：证书
  const [sslMode, setSslMode] = React.useState<'auto' | 'manual'>('auto')
  const [sslChallenge, setSslChallenge] = React.useState<'http' | 'dns'>('http')
  const [sslPort, setSslPort] = React.useState(80)
  const [keyPath, setKeyPath] = React.useState('./config/ssl/private.key')
  const [crtPath, setCrtPath] = React.useState('./config/ssl/public.crt')
  const [sslParams, setSslParams] = React.useState<DnsRecord[]>([])
  /** 证书签发进度（后端异步跑，这里轮询） */
  const [certPhase, setCertPhase] = React.useState<
    'idle' | 'running' | 'need_txt' | 'ok' | 'ok_fallback' | 'failed'
  >('idle')
  const [certError, setCertError] = React.useState('')

  // 第 5 步：管理员
  const [account, setAccount] = React.useState('admin')
  const [password, setPassword] = React.useState('')
  const [password2, setPassword2] = React.useState('')
  const [adminReady, setAdminReady] = React.useState(false)

  /** 进入向导先探一次数据库配置：能读出来说明还处在安装模式 */
  const probe = React.useCallback(async () => {
    try {
      const [db, domain] = await Promise.all([
        setupPost<DbConfig>({ action: 'get', step: 'database' }),
        setupPost<DomainConfig>({ action: 'get', step: 'domain' }).catch(() => null),
      ])
      if (db) {
        setDbType(db.db_type === 'mysql' ? 'mysql' : 'sqlite')
        if (typeof db.db_dsn === 'string' && db.db_dsn) setDbDsn(db.db_dsn)
      }
      if (domain) {
        setWebDomain(domain.web_domain ?? '')
        setSmtpDomain(domain.smtp_domain ?? '')
        setExtraDomains(Array.isArray(domain.domains) ? domain.domains.filter(Boolean) : [])
      }
      setPhase('ready')
    } catch (error) {
      // 只有安装处理器返回的业务错误（信封里的 errorNo 是数字）才留在向导里；
      // 其它情况（/api/setup 已不存在、或请求被重定向成了 HTML 页面）说明已经装好了
      const fromSetupHandler = error instanceof ApiError && typeof error.code === 'number'
      if (fromSetupHandler) {
        toast.error(t('setup.failed', { message: errorText(error) }))
        setPhase('ready')
      } else {
        setPhase('installed')
      }
    }
  }, [t])

  React.useEffect(() => {
    if (probed.current) return
    probed.current = true
    void probe()
  }, [probe])

  const loadDns = React.useCallback(
    async (recheck: boolean) => {
      setDnsLoading(true)
      try {
        // 后端生成记录时会请求外网取公网 IP，容器没有出网能力时会一直挂着，
        // 所以这里单独收紧超时，超时就提示而不是让用户干等。
        const data = await setupPost<DnsInfo>({ action: 'get', step: 'dns' }, 25_000)
        if (data && typeof data === 'object') setDnsInfos(data)
        setDnsRechecked(recheck)
      } catch (error) {
        const timedOut = (error as { code?: string })?.code === 'ECONNABORTED'
        toast.error(
          timedOut ? t('setup.dns.timeout') : t('setup.failed', { message: errorText(error) }),
        )
      } finally {
        setDnsLoading(false)
      }
    },
    [t],
  )

  const loadSslConfig = React.useCallback(async () => {
    try {
      const data = await setupPost<SslConfig>({ action: 'get', step: 'ssl' })
      if (data) {
        if (data.type === '1') {
          setSslMode('manual')
        } else {
          setSslMode('auto')
          setSslChallenge(data.type === '2' ? 'dns' : 'http')
        }
        if (typeof data.port === 'number' && data.port > 0) setSslPort(data.port)
      }
    } catch (error) {
      toast.error(t('setup.failed', { message: errorText(error) }))
    }
  }, [t])

  const loadSslParams = React.useCallback(async () => {
    try {
      const data = await setupPost<DnsRecord[]>({ action: 'getParams', step: 'ssl' })
      setSslParams(Array.isArray(data) ? data : [])
    } catch (error) {
      toast.error(t('setup.failed', { message: errorText(error) }))
    }
  }, [t])

  const loadAdminState = React.useCallback(async () => {
    try {
      // services/setup/db.go: GetAdminPassword 返回 (string, error) —— 已有用户的 account，
      // 没有用户时是空串。所以 data 是字符串，不是 bool。
      const existing = await setupPost<string>({ action: 'get', step: 'password' })
      const accountName = typeof existing === 'string' ? existing : ''
      setAdminReady(accountName !== '')
      if (accountName) setAccount(accountName)
    } catch (error) {
      toast.error(t('setup.failed', { message: errorText(error) }))
    }
  }, [t])

  /** ssl_type 是字符串：1 = 用户证书、0 = 自动 HTTP、2 = 自动 DNS */
  const sslType = sslMode === 'manual' ? '1' : sslChallenge === 'dns' ? '2' : '0'

  const finish = async () => {
    if (!adminReady) {
      if (!password) {
        toast.error(t('common.required'))
        return
      }
      if (password !== password2) {
        toast.error(t('admin.security.pwdMismatch'))
        return
      }
      await setupPost<unknown>({
        action: 'set',
        step: 'password',
        account: account.trim(),
        password,
      })
      // 记住已经建过管理员，后面证书步骤失败重试时不要重复插入用户
      setAdminReady(true)
    }

    // 证书这一步是唯一会触发「安装完成」的调用，必须放最后。
    //
    // 手动证书：后端校验文件后同步收尾。
    // 自动证书：后端改成异步签发了（原来同步阻塞到 ACME 结束，前端必然超时），
    //          这里先拿到 running，再轮询 action=status 直到出结果；
    //          DNS 挑战会先把 TXT 记录吐出来，主人加上后后端自己检测通过。
    setCertPhase('running')
    setCertError('')

    if (sslMode === 'manual') {
      try {
        await setupPost<unknown>({
          action: 'set',
          step: 'ssl',
          ssl_type: '1',
          key_path: keyPath.trim(),
          crt_path: crtPath.trim(),
        })
      } catch (error) {
        setCertPhase('failed')
        setCertError(errorText(error))
        toast.error(t('setup.ssl.failed'), t('setup.ssl.failedHint'))
        return
      }
    } else {
      try {
        let status = await setupPost<CertStatus>({
          action: 'set',
          step: 'ssl',
          ssl_type: sslType,
          key_path: keyPath.trim(),
          crt_path: crtPath.trim(),
        })

        const deadline = Date.now() + 15 * 60 * 1000
        while (Date.now() < deadline) {
          if (status.state === 'ok' || status.state === 'ok_fallback' || status.state === 'failed') break
          if (status.records && status.records.length > 0) {
            setSslParams(status.records)
            setCertPhase('need_txt')
          }
          await new Promise((resolve) => setTimeout(resolve, 2000))
          status = await setupPost<CertStatus>({ action: 'status', step: 'ssl' })
        }

        if (status.state === 'failed') {
          setCertPhase('failed')
          setCertError(status.error || '')
          toast.error(t('setup.ssl.failed'), t('setup.ssl.failedHint'))
          return
        }
        if (status.state === 'ok_fallback') {
          setCertPhase('ok_fallback')
          setCertError(status.error || '')
          toast.info(t('setup.ssl.fallback'), status.error || undefined)
        } else {
          setCertPhase('ok')
        }
      } catch (error) {
        setCertPhase('failed')
        setCertError(errorText(error))
        toast.error(t('setup.ssl.failed'), t('setup.ssl.failedHint'))
        return
      }
    }

    const installed = await waitInstalled(30_000)
    if (!installed) {
      toast.error(t('setup.ssl.failed'), t('setup.ssl.failedHint'))
      return
    }

    toast.success(t('setup.finished'))
    await loadSession(true)
    navigate('/login', { replace: true })
  }

  const goNext = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (step === 0) {
        await setupPost<unknown>({
          action: 'set',
          step: 'domain',
          web_domain: webDomain.trim(),
          smtp_domain: smtpDomain.trim(),
          // 提交时是逗号拼接的字符串，读回来是数组（后端同一字段两种形态）
          multi_domain: extraDomains.map((item) => item.trim()).filter(Boolean).join(','),
        })
        setStep(1)
        await loadDns(false)
      } else if (step === 1) {
        setStep(2)
      } else if (step === 2) {
        const dsn = dbDsn.trim()
        if (!dsn) {
          setDbError(t('setup.db.required'))
          return
        }
        setDbError('')
        await setupPost<unknown>({ action: 'set', step: 'database', db_type: dbType, db_dsn: dsn })
        setStep(3)
        await loadSslConfig()
      } else if (step === 3) {
        setStep(4)
        await loadAdminState()
      } else {
        await finish()
      }
    } catch (error) {
      toast.error(t('setup.failed', { message: errorText(error) }))
    } finally {
      setBusy(false)
    }
  }

  const statusOf = (record: DnsRecord): DnsStatus =>
    dnsLoading ? 'pending' : recordStatus(record, dnsRechecked)

  const hasEmptyHost = Object.values(dnsInfos).some((records) =>
    records.some((record) => !record.host),
  )

  if (phase === 'installed') return <Navigate to="/login" replace />
  if (phase === 'probing') return <PageLoading label={t('common.loading')} />

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto w-full max-w-[720px] px-6 py-10">
        <header className="mb-6 flex items-start gap-3">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-primary text-primary-fg shadow-e1">
            <svg
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
              <path d="m3.5 7 7.4 5.3a2 2 0 0 0 2.2 0L20.5 7" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-[700] tracking-[-0.02em]">{t('setup.title')}</h1>
            <p className="mt-0.5 text-[12px] leading-relaxed text-fg-subtle">
              {t('setup.welcomeDesc')}
            </p>
          </div>
        </header>

        {/* ---------------- 步骤条 ---------------- */}
        <ol className="mb-5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {STEPS.map((key, index) => {
            const done = index < step
            const active = index === step
            return (
              <li key={key} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={cn(
                    'grid h-7 w-7 flex-none place-items-center rounded-full text-[12px] font-[700] transition-colors',
                    done && 'bg-primary text-primary-fg',
                    active && 'bg-primary text-primary-fg ring-4 ring-[var(--ring)]',
                    !done && !active && 'bg-surface-3 text-fg-subtle',
                  )}
                >
                  {done ? '✓' : index + 1}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-[12.5px] font-[600]',
                    active ? 'text-primary' : done ? 'text-fg' : 'text-fg-subtle',
                  )}
                >
                  {t(`setup.step.${key}`)}
                </span>
                {index < STEPS.length - 1 ? (
                  <span className={cn('h-px min-w-3 flex-1', done ? 'bg-primary' : 'bg-border-base')} />
                ) : null}
              </li>
            )
          })}
        </ol>

        {/* ---------------- 卡片 ---------------- */}
        <div className="rounded-[18px] border border-border-base bg-surface shadow-e2">
          <div className="px-6 py-6">
            {step === 0 ? (
              <>
                <CardHead title={t('setup.domain.title')} desc={t('setup.domain.desc')} />
                <Field label={t('setup.domain.web')}>
                  <Input
                    value={webDomain}
                    onChange={(event) => setWebDomain(event.target.value)}
                    placeholder="pmail.example.com"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label={t('setup.domain.smtp')}>
                  <Input
                    value={smtpDomain}
                    onChange={(event) => setSmtpDomain(event.target.value)}
                    placeholder="example.com"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label={t('setup.domain.multi')} hint={t('setup.domain.multiDesc')}>
                  <div className="flex flex-col gap-2">
                    {extraDomains.map((item, index) => (
                      <div key={`extra-domain-${index}`} className="flex items-center gap-2">
                        <Input
                          value={item}
                          onChange={(event) => {
                            const next = event.target.value
                            setExtraDomains((prev) =>
                              prev.map((value, i) => (i === index ? next : value)),
                            )
                          }}
                          placeholder={`domain${index + 1}.com`}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('common.delete')}
                          onClick={() =>
                            setExtraDomains((prev) => prev.filter((_, i) => i !== index))
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      onClick={() => setExtraDomains((prev) => [...prev, ''])}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('common.add')}
                    </Button>
                  </div>
                </Field>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <div className="mb-5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15.5px] font-[650] tracking-[-0.01em]">
                      {t('setup.dns.title')}
                    </h2>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
                      {t('setup.dns.desc')}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={dnsLoading}
                    onClick={() => void loadDns(true)}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', dnsLoading && 'animate-spin')} />
                    {t('setup.dns.check')}
                  </Button>
                </div>

                {Object.keys(dnsInfos).length === 0 ? (
                  <EmptyState
                    icon={<RefreshCw className="h-5 w-5" />}
                    title={t('common.empty')}
                    description={t('setup.dns.desc')}
                    className="py-10"
                  />
                ) : (
                  <div className="flex flex-col gap-5">
                    {Object.entries(dnsInfos).map(([domain, records]) => (
                      <div key={domain}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="truncate text-[13px] font-[650]">{domain}</span>
                          <Badge tone="outline">{records.length}</Badge>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border-base">
                          <table className="w-full border-collapse text-[12.5px]">
                            <thead>
                              <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.04em] text-fg-subtle">
                                <th className="px-3 py-2 font-[650]">{t('setup.dns.type')}</th>
                                <th className="px-3 py-2 font-[650]">{t('setup.dns.host')}</th>
                                <th className="px-3 py-2 font-[650]">{t('setup.dns.value')}</th>
                                <th className="px-3 py-2 font-[650]">{t('setup.dns.status')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {records.map((record, index) => {
                                const status = statusOf(record)
                                return (
                                  <tr
                                    key={`${record.type}-${record.host}-${index}`}
                                    className="border-t border-border-base"
                                  >
                                    <td className="px-3 py-2 font-mono text-[11.5px] text-fg-muted">
                                      {record.type}
                                    </td>
                                    <td className="px-3 py-2">
                                      {record.host ? (
                                        <span className="font-mono text-[11.5px]">{record.host}</span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1">
                                          <span className="font-mono text-[11.5px]">@</span>
                                          <Tooltip label={t('setup.dns.rootHint')}>
                                            <span className="cursor-help text-fg-subtle">?</span>
                                          </Tooltip>
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-start gap-1.5">
                                        <span className="min-w-0 break-all font-mono text-[11.5px] text-fg-muted">
                                          {record.value}
                                        </span>
                                        {record.tips ? (
                                          <Tooltip label={record.tips}>
                                            <span className="flex-none cursor-help text-fg-subtle">?</span>
                                          </Tooltip>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <Badge tone={DNS_STATUS[status].tone}>
                                        {t(DNS_STATUS[status].label)}
                                      </Badge>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}

                    {hasEmptyHost ? (
                      <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                        {t('setup.dns.rootHint')}
                      </p>
                    ) : null}
                    <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                      {t('setup.dns.dkimHint')}
                    </p>
                  </div>
                )}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <CardHead title={t('setup.db.title')} desc={t('setup.db.desc')} />
                <Field label={t('setup.db.type')}>
                  <Select
                    value={dbType}
                    onChange={(event) => {
                      const next = event.target.value === 'mysql' ? 'mysql' : 'sqlite'
                      setDbType(next)
                      setDbDsn(next === 'sqlite' ? './config/pmail.db' : '')
                      setDbError('')
                    }}
                  >
                    <option value="sqlite">SQLite</option>
                    <option value="mysql">MySQL</option>
                  </Select>
                </Field>
                <Field
                  label={dbType === 'sqlite' ? t('setup.db.path') : t('setup.db.dsn')}
                  error={dbError || undefined}
                  hint={dbType === 'sqlite' ? undefined : 'root:password@tcp(127.0.0.1:3306)/pmail'}
                >
                  <Input
                    value={dbDsn}
                    onChange={(event) => {
                      setDbDsn(event.target.value)
                      if (dbError) setDbError('')
                    }}
                    placeholder={
                      dbType === 'sqlite'
                        ? './config/pmail.db'
                        : 'root:password@tcp(127.0.0.1:3306)/pmail?parseTime=True&loc=Local'
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <CardHead title={t('setup.ssl.title')} />
                <div className="flex flex-col gap-2.5">
                  <ModeOption
                    active={sslMode === 'auto'}
                    title={t('setup.ssl.auto')}
                    onSelect={() => setSslMode('auto')}
                  />
                  <ModeOption
                    active={sslMode === 'manual'}
                    title={t('setup.ssl.manual')}
                    onSelect={() => setSslMode('manual')}
                  />
                </div>

                {sslMode === 'auto' ? (
                  <div className="mt-5">
                    <Field label={t('setup.ssl.challenge')}>
                      <Select
                        value={sslChallenge}
                        onChange={(event) => {
                          const next = event.target.value === 'dns' ? 'dns' : 'http'
                          setSslChallenge(next)
                          if (next === 'dns') void loadSslParams()
                        }}
                      >
                        <option value="http">{t('setup.ssl.http')}</option>
                        <option value="dns">{t('setup.ssl.dns')}</option>
                      </Select>
                    </Field>

                    {sslChallenge === 'dns' ? (
                      <Field
                        label={t('setup.ssl.provider')}
                        hint={sslParams.length === 0 ? t('setup.ssl.waitDesc') : undefined}
                      >
                        {sslParams.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-3 py-4 text-center text-[12px] text-fg-subtle">
                            {t('setup.ssl.wait')}
                          </div>
                        ) : (
                          <ul className="flex flex-col gap-1.5 rounded-xl border border-border-base bg-surface-2 p-3">
                            {sslParams.map((item, index) => (
                              <li
                                key={`${item.type}-${item.host}-${index}`}
                                className="flex items-start gap-2 font-mono text-[11.5px]"
                              >
                                <span className="w-14 flex-none text-fg-subtle">{item.type}</span>
                                <span className="w-36 flex-none truncate">{item.host || '@'}</span>
                                <span className="min-w-0 flex-1 break-all text-fg-muted">
                                  {item.value}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Field>
                    ) : null}

                    {sslPort !== 80 ? (
                      <p className="mt-1 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2 text-[12px] leading-relaxed text-warning">
                        {t('setup.ssl.portWarn')}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-5">
                    <Field label={t('setup.ssl.keyPath')}>
                      <Input
                        value={keyPath}
                        onChange={(event) => setKeyPath(event.target.value)}
                        placeholder="./config/ssl/private.key"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </Field>
                    <Field label={t('setup.ssl.crtPath')}>
                      <Input
                        value={crtPath}
                        onChange={(event) => setCrtPath(event.target.value)}
                        placeholder="./config/ssl/public.crt"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </Field>
                  </div>
                )}
              </>
            ) : null}

            {step === 4 ? (
              <>
                <CardHead title={t('setup.admin.title')} desc={t('setup.admin.desc')} />
                {adminReady ? (
                  <div className="mb-4">
                    <Badge tone="success">{t('common.saved')}</Badge>
                  </div>
                ) : null}
                <Field label={t('setup.admin.account')}>
                  <Input
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    disabled={adminReady}
                  />
                </Field>
                <Field label={t('setup.admin.password')}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={adminReady}
                  />
                </Field>
                <Field label={t('setup.admin.confirm')}>
                  <Input
                    type="password"
                    value={password2}
                    onChange={(event) => setPassword2(event.target.value)}
                    autoComplete="new-password"
                    disabled={adminReady}
                  />
                </Field>
              </>
            ) : null}
          </div>

          {/* 证书签发进度：自动模式下后端异步跑，这里实时显示 */}
          {certPhase !== 'idle' ? (
            <div className="mx-6 mb-3 rounded-xl border border-border-base bg-surface-2 px-4 py-3">
              <p className="text-[12.5px] font-[600]">
                {certPhase === 'running' ? t('setup.ssl.running') : null}
                {certPhase === 'need_txt' ? t('setup.ssl.needTxt') : null}
                {certPhase === 'ok' ? t('setup.ssl.ok') : null}
                {certPhase === 'ok_fallback' ? t('setup.ssl.fallback') : null}
                {certPhase === 'failed' ? t('setup.ssl.failed') : null}
              </p>
              {certError ? (
                <p className="mt-1 break-all text-[11.5px] leading-relaxed text-fg-subtle">
                  {certError}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* 底部固定的上一步 / 下一步 */}
          <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-b-[18px] border-t border-border-base bg-surface px-6 py-3.5">
            <Button
              variant="secondary"
              disabled={step === 0 || busy}
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            >
              {t('common.prev')}
            </Button>
            <div className="flex items-center gap-2">
              {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
              <Button variant="primary" disabled={busy} onClick={() => void goNext()}>
                {step === STEPS.length - 1 ? t('setup.finish') : t('common.next')}
              </Button>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[11.5px] text-fg-subtle">{t('setup.thanks')}</p>
      </div>
    </div>
  )
}
