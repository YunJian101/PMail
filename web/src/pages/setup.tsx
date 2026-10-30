import * as React from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, Copy, HardDriveDownload, Loader2, Plus, ShieldCheck, X } from 'lucide-react'
import { ApiError, get, post } from '@/api/client'
import { cn } from '@/lib/utils'
import { toast, errorText } from '@/lib/toast'
import { useSession } from '@/store/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty'
import { PageLoading, Spinner } from '@/components/ui/skeleton'
import { VersionTag } from '@/components/ui/version-tag'

/**
 * 安装接口只有一个入口：POST /api/setup，靠 {action, step} 分流。
 * 依据 server/controllers/setup.go：
 *   get      + database | password | domain | dns | ssl
 *   set      + database | password | domain | ssl
 *   loadFnOsCert / uploadCert / finish（证书步骤，两种方式 + 收尾）
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

interface DnsRecord {
  host: string
  type: string
  value: string
  ttl?: number | string
  tips?: string
}

type DnsInfo = Record<string, DnsRecord[]>

/** 证书接口的返回：摘要 + 安装是否真的收尾成功 */
interface CertResult {
  found: boolean
  source?: string
  domain?: string
  expire?: string
  message?: string
  finished?: boolean
  reason?: string
}

interface FinishResult {
  finished: boolean
  reason?: string
}

/** 邮箱域名不该带这些主机名前缀，系统会自己拼 smtp./imap./pop. */
const MAIL_HOST_PREFIXES = ['smtp.', 'smtps.', 'submission.', 'imap.', 'pop.', 'pop3.', 'webmail.', 'mx.']

function looksLikeHostName(value: string): boolean {
  const domain = value.trim().toLowerCase()
  return MAIL_HOST_PREFIXES.some((prefix) => domain.startsWith(prefix))
}

/** 把误填成 smtp.example.com 的邮箱域名还原成 example.com */
function normalizeMailDomain(raw: string): string {
  const domain = raw.trim().toLowerCase().replace(/\.$/, '')
  for (const prefix of MAIL_HOST_PREFIXES) {
    if (!domain.startsWith(prefix)) continue
    const rest = domain.slice(prefix.length)
    if (rest.includes('.')) return rest
  }
  return domain
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

  // 第 2 步：DNS（后端纯本地算，不联网，进这一步就自动拉）
  const [dnsInfos, setDnsInfos] = React.useState<DnsInfo>({})
  const [dnsLoading, setDnsLoading] = React.useState(false)
  /** 公网 IP：填了就把所有 A 记录的值换掉，纯前端替换，不需要网络 */
  const [publicIP, setPublicIP] = React.useState('')
  const [copiedKey, setCopiedKey] = React.useState('')

  // 第 3 步：数据库
  const [dbType, setDbType] = React.useState<'sqlite' | 'mysql'>('sqlite')
  const [dbDsn, setDbDsn] = React.useState('./config/pmail.db')
  const [dbError, setDbError] = React.useState('')

  // 第 4 步：证书（从飞牛加载 / 粘贴自有证书）
  const [sslMode, setSslMode] = React.useState<'fnos' | 'paste'>('fnos')
  const [certBusy, setCertBusy] = React.useState(false)
  const [certInfo, setCertInfo] = React.useState<CertResult | null>(null)
  const [certError, setCertError] = React.useState('')
  const [keyPem, setKeyPem] = React.useState('')
  const [crtPem, setCrtPem] = React.useState('')

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

  const loadDns = React.useCallback(async () => {
    setDnsLoading(true)
    try {
      // 记录完全由后端在本地拼出来（不再去外网查公网 IP），所以不需要长超时
      const data = await setupPost<DnsInfo>({ action: 'get', step: 'dns' }, 15_000)
      if (data && typeof data === 'object') setDnsInfos(data)
    } catch (error) {
      toast.error(t('setup.failed', { message: errorText(error) }))
    } finally {
      setDnsLoading(false)
    }
  }, [t])

  // 进到 DNS 这一步就自动把记录铺出来（从后面返回上一步再进来也会重新拉一次）
  const dnsTried = React.useRef(false)
  React.useEffect(() => {
    if (step !== 1) {
      dnsTried.current = false
      return
    }
    if (phase !== 'ready' || dnsTried.current) return
    dnsTried.current = true
    void loadDns()
  }, [step, phase, loadDns])

  /** 复制：内网是 http，navigator.clipboard 在非安全上下文里不可用，得留个兜底 */
  const copyText = async (key: string, text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const holder = document.createElement('textarea')
        holder.value = text
        holder.style.position = 'fixed'
        holder.style.opacity = '0'
        document.body.appendChild(holder)
        holder.select()
        document.execCommand('copy')
        document.body.removeChild(holder)
      }
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((current) => (current === key ? '' : current)), 1500)
    } catch {
      toast.error(t('setup.dns.copyFailed'))
    }
  }

  /** 从飞牛加载证书：后端读 /usr/trim/var/trim_connect/ssls 里最新的那一套 */
  const loadFnOsCert = React.useCallback(async () => {
    setCertBusy(true)
    setCertError('')
    try {
      const info = await setupPost<CertResult>({ action: 'loadFnOsCert', step: 'ssl' })
      setCertInfo(info)
      if (!info.found) setCertError(info.message || t('setup.ssl.failedHint'))
      return info
    } catch (error) {
      setCertInfo(null)
      setCertError(errorText(error))
      return null
    } finally {
      setCertBusy(false)
    }
  }, [t])

  /** 粘贴自有证书：后端校验私钥与证书是否配对，然后写进 config/ssl */
  const savePemCert = React.useCallback(async () => {
    if (!keyPem.trim() || !crtPem.trim()) {
      toast.error(t('setup.ssl.needBoth'))
      return null
    }
    setCertBusy(true)
    setCertError('')
    try {
      const info = await setupPost<CertResult>({
        action: 'uploadCert',
        step: 'ssl',
        key: keyPem,
        crt: crtPem,
      })
      setCertInfo(info)
      if (!info.found) setCertError(info.message || t('setup.ssl.failedHint'))
      return info
    } catch (error) {
      setCertInfo(null)
      setCertError(errorText(error))
      return null
    } finally {
      setCertBusy(false)
    }
  }, [keyPem, crtPem, t])

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
      // 记住已经建过管理员，后面重试时不要重复插入用户
      setAdminReady(true)
    }

    // 证书还没就位就先落地（后端幂等，重复调用只会覆盖同一份文件）
    if (!certInfo?.found) {
      const info = sslMode === 'fnos' ? await loadFnOsCert() : await savePemCert()
      if (!info?.found) {
        toast.error(t('setup.ssl.failed'), t('setup.ssl.failedHint'))
        return
      }
    }

    // 收尾：后端会自己检查「域名 / 数据库 / 管理员 / 证书」是不是都齐了，
    // 缺任何一项都不会把安装标记完成（否则会进得去登录页却登不上）
    try {
      const res = await setupPost<FinishResult>({ action: 'finish', step: 'ssl' })
      if (!res.finished) {
        setCertError(t('setup.ssl.finishBlocked', { reason: res.reason || '' }))
        toast.error(t('setup.ssl.failed'), res.reason || t('setup.ssl.failedHint'))
        return
      }
    } catch (error) {
      setCertError(errorText(error))
      toast.error(t('setup.ssl.failed'), errorText(error))
      return
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
        // 邮箱域名统一去掉误填的 smtp./mail. 前缀；被改过就提示一下
        const mailDomain = normalizeMailDomain(smtpDomain)
        if (mailDomain !== smtpDomain.trim().toLowerCase()) {
          setSmtpDomain(mailDomain)
          toast.info(t('setup.domain.normalized'), mailDomain)
        }
        await setupPost<unknown>({
          action: 'set',
          step: 'domain',
          web_domain: webDomain.trim().toLowerCase(),
          smtp_domain: mailDomain,
          // 提交时是逗号拼接的字符串，读回来是数组（后端同一字段两种形态）
          multi_domain: extraDomains
            .map((item) => normalizeMailDomain(item))
            .filter(Boolean)
            .join(','),
        })
        setStep(1)
        await loadDns()
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

  const hasEmptyHost = Object.values(dnsInfos).some((records) =>
    records.some((record) => !record.host),
  )

  if (phase === 'installed') return <Navigate to="/login" replace />
  if (phase === 'probing') return <PageLoading label={t('common.loading')} />

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto w-full max-w-[720px] px-6 py-10">
        <header className="mb-6 flex items-start gap-3">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-sm bg-primary text-primary-fg shadow-e1">
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
        <div className="rounded-xl border border-border-base bg-surface shadow-e1">
          <div className="px-6 py-6">
            {step === 0 ? (
              <>
                <CardHead title={t('setup.domain.title')} desc={t('setup.domain.desc')} />
                <Field label={t('setup.domain.web')} hint={t('setup.domain.webHint')}>
                  <Input
                    value={webDomain}
                    onChange={(event) => setWebDomain(event.target.value)}
                    placeholder="pmail.example.com"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label={t('setup.domain.smtp')} hint={looksLikeHostName(smtpDomain) ? t('setup.domain.prefixWarn') : t('setup.domain.smtpHint')}>
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
                <div className="mb-4">
                  <h2 className="text-[15.5px] font-[650] tracking-[-0.01em]">
                    {t('setup.dns.title')}
                  </h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
                    {t('setup.dns.desc')}
                  </p>
                </div>

                {/* 公网 IP：纯本地替换，填完立刻反映到下面的 A 记录，不需要联网也不用刷新 */}
                <div className="mb-4 rounded-md border border-border-base bg-surface-2 px-3.5 py-3">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <Field
                        label={t('setup.dns.publicIP')}
                        hint={t('setup.dns.publicIPHint')}
                        className="mb-0"
                      >
                        <Input
                          value={publicIP}
                          onChange={(event) => setPublicIP(event.target.value)}
                          placeholder="1.2.3.4"
                          inputMode="decimal"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </Field>
                    </div>
                    <div className="flex flex-none items-center gap-1.5 pb-0.5 text-[11.5px] text-fg-subtle sm:pt-6">
                      {dnsLoading ? (
                        <>
                          <Spinner className="h-3.5 w-3.5" />
                          {t('setup.dns.loading')}
                        </>
                      ) : (
                        <span>{t('setup.dns.offline')}</span>
                      )}
                    </div>
                  </div>
                </div>

                {Object.keys(dnsInfos).length === 0 ? (
                  <EmptyState
                    icon={<Loader2 className="h-5 w-5" />}
                    title={dnsLoading ? t('setup.dns.loading') : t('common.empty')}
                    description={t('setup.dns.emptyHint')}
                    className="py-10"
                  />
                ) : (
                  <div className="flex flex-col gap-4">
                    {Object.entries(dnsInfos).map(([domain, records]) => (
                      <section
                        key={domain}
                        className="overflow-hidden rounded-md border border-border-base"
                      >
                        <header className="flex items-center gap-2 bg-surface-2 px-3.5 py-2.5">
                          <span className="truncate text-[13px] font-[650]">{domain}</span>
                          <Badge tone="outline">
                            {t('setup.dns.records', { count: records.length })}
                          </Badge>
                        </header>
                        <table className="w-full table-fixed border-collapse text-[12.5px]">
                          <colgroup>
                            <col className="w-[62px]" />
                            <col className="w-[34%]" />
                            <col />
                          </colgroup>
                          <thead>
                            <tr className="border-t border-border-base text-left text-[11px] text-fg-subtle">
                              <th className="px-3 py-1.5 font-[650]">{t('setup.dns.type')}</th>
                              <th className="px-3 py-1.5 font-[650]">{t('setup.dns.host')}</th>
                              <th className="px-3 py-1.5 font-[650]">{t('setup.dns.value')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {records.map((record, index) => {
                              const rowKey = `${domain}-${index}`
                              const value =
                                record.type === 'A' && publicIP.trim()
                                  ? publicIP.trim()
                                  : record.value
                              return (
                                <tr
                                  key={rowKey}
                                  className="border-t border-border-base align-top transition-colors hover:bg-surface-2"
                                >
                                  <td className="px-3 py-2 font-mono text-[11px] text-fg-muted">
                                    {record.type}
                                  </td>
                                  <td className="break-all px-3 py-2 font-mono text-[11.5px]">
                                    {record.host ? record.host : '@'}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-start gap-2">
                                      <span className="min-w-0 flex-1 break-all font-mono text-[11.5px] leading-relaxed text-fg-muted">
                                        {value}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => void copyText(rowKey, value)}
                                        title={t('setup.dns.copy')}
                                        aria-label={t('setup.dns.copy')}
                                        className="grid h-6 w-6 flex-none place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-3 hover:text-primary"
                                      >
                                        {copiedKey === rowKey ? (
                                          <Check className="h-3.5 w-3.5 text-success" />
                                        ) : (
                                          <Copy className="h-3.5 w-3.5" />
                                        )}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </section>
                    ))}

                    <div className="flex flex-col gap-1">
                      {hasEmptyHost ? (
                        <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                          {t('setup.dns.rootHint')}
                        </p>
                      ) : null}
                      <p className="text-[11.5px] leading-relaxed text-fg-subtle">
                        {t('setup.dns.dkimHint')}
                      </p>
                    </div>
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
                <CardHead title={t('setup.ssl.title')} desc={t('setup.ssl.desc')} />
                <div className="flex flex-col gap-2.5">
                  <ModeOption
                    active={sslMode === 'fnos'}
                    title={t('setup.ssl.fnos')}
                    onSelect={() => {
                      setSslMode('fnos')
                      setCertInfo(null)
                      setCertError('')
                    }}
                  />
                  <ModeOption
                    active={sslMode === 'paste'}
                    title={t('setup.ssl.paste')}
                    onSelect={() => {
                      setSslMode('paste')
                      setCertInfo(null)
                      setCertError('')
                    }}
                  />
                </div>

                {sslMode === 'fnos' ? (
                  <div className="mt-5">
                    <p className="mb-3 text-[12px] leading-relaxed text-fg-muted">
                      {t('setup.ssl.fnosDesc')}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={certBusy}
                      onClick={() => void loadFnOsCert()}
                    >
                      {certBusy ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <HardDriveDownload className="h-3.5 w-3.5" />
                      )}
                      {certBusy ? t('setup.ssl.loading') : t('setup.ssl.load')}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-5">
                    <p className="mb-3 text-[12px] leading-relaxed text-fg-muted">
                      {t('setup.ssl.pasteDesc')}
                    </p>
                    <Field label={t('setup.ssl.keyPem')}>
                      <Textarea
                        rows={5}
                        value={keyPem}
                        onChange={(event) => setKeyPem(event.target.value)}
                        placeholder="-----BEGIN PRIVATE KEY-----"
                        spellCheck={false}
                        autoComplete="off"
                        className="font-mono text-[11.5px] leading-relaxed"
                      />
                    </Field>
                    <Field label={t('setup.ssl.crtPem')}>
                      <Textarea
                        rows={5}
                        value={crtPem}
                        onChange={(event) => setCrtPem(event.target.value)}
                        placeholder="-----BEGIN CERTIFICATE-----"
                        spellCheck={false}
                        autoComplete="off"
                        className="font-mono text-[11.5px] leading-relaxed"
                      />
                    </Field>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={certBusy}
                      onClick={() => void savePemCert()}
                    >
                      {certBusy ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {t('setup.ssl.save')}
                    </Button>
                  </div>
                )}

                {certInfo?.found ? (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-success" />
                    <div className="min-w-0 text-[12px] leading-relaxed">
                      <p className="font-[600] text-fg">
                        {t('setup.ssl.loaded', {
                          domain: certInfo.domain || '-',
                          expire: certInfo.expire || '-',
                        })}
                      </p>
                      {certInfo.source ? (
                        <p className="mt-0.5 break-all font-mono text-[11px] text-fg-subtle">
                          {certInfo.source}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {certError ? (
                  <p className="mt-3 break-all rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[11.5px] leading-relaxed text-danger">
                    {certError}
                  </p>
                ) : null}
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

          {/* 底部固定的上一步 / 下一步 */}
          <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-b-xl border-t border-border-base bg-surface px-6 py-3.5">
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

        <div className="mt-4 flex items-center justify-center gap-2 text-[11.5px] text-fg-subtle">
          <span>{t('setup.thanks')}</span>
          <VersionTag />
        </div>
      </div>
    </div>
  )
}
