<#
.SYNOPSIS
    PMail install-flow acceptance test (runs a real process locally, no fnOS needed).

.DESCRIPTION
    Starts a real pmail process on a clean data directory and walks the setup
    wizard through its API, asserting along the way. Covers what this round
    changed:
      * before install, every /api/* answers 402 (so the login page is unreachable)
      * DNS records are generated offline and fast
      * cert: load-from-fnOS (no fnOS dir on this box -> clear error message)
              + paste-your-own (real key/cert pair validation)
      * finish only succeeds when domain + database + admin + certificate are all set
      * after finish, login returns the admin account

    NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 reads
    .ps1 as ANSI unless there is a BOM, so non-ASCII text turns into parse errors.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-pmail.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-pmail.ps1 -Keep
#>
param(
    [int]$SetupPort = 18080,
    [int]$HttpPort = 18081,
    [switch]$Keep,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$ws = Split-Path -Parent $PSScriptRoot
if (-not $ws) { $ws = (Get-Location).Path }

$GoExe = Join-Path $ws '.tools\go\bin\go.exe'
if (-not (Test-Path $GoExe)) {
    $cmd = Get-Command go -ErrorAction SilentlyContinue
    if (-not $cmd) { throw 'go not found' }
    $GoExe = $cmd.Source
}

$env:GOPATH = Join-Path $ws '.tools\gopath'
$env:GOCACHE = Join-Path $ws '.tools\gocache'
$env:GOTMPDIR = Join-Path $ws '.tools\gotmp'
$env:GOPROXY = 'off'
$env:GOFLAGS = '-mod=mod'
New-Item -ItemType Directory -Force -Path $env:GOPATH, $env:GOCACHE, $env:GOTMPDIR | Out-Null

$root = Join-Path $ws '.tmp\e2e'
$binary = Join-Path $ws 'build\pmail-e2e.exe'
$results = New-Object System.Collections.Generic.List[object]

function Check {
    param([string]$Name, [bool]$Ok, [string]$Detail = '')
    $script:results.Add([pscustomobject]@{ Name = $Name; Ok = $Ok; Detail = $Detail })
    if ($Ok) {
        Write-Host ("  [PASS] " + $Name) -ForegroundColor Green
    } else {
        Write-Host ("  [FAIL] " + $Name + "  " + $Detail) -ForegroundColor Red
    }
}

function Wait-For {
    param([scriptblock]$Probe, [int]$TimeoutSec = 30)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try { if (& $Probe) { return $true } } catch { }
        Start-Sleep -Milliseconds 300
    }
    return $false
}

# ---------- build + clean data dir ----------
if (-not $SkipBuild) {
    Write-Host '==> building test binary' -ForegroundColor Cyan
    Push-Location (Join-Path $ws 'server')
    try {
        & $GoExe build -trimpath -ldflags '-s -w' -o $binary .
        if ($LASTEXITCODE -ne 0) { throw 'go build failed' }
    }
    finally { Pop-Location }
}
if (-not (Test-Path $binary)) { throw "binary not found: $binary" }

if (Test-Path $root) { Remove-Item $root -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $root 'config\dkim'), (Join-Path $root 'config\ssl') | Out-Null

$rootUnix = $root -replace '\\', '/'
$config = [ordered]@{
    logLevel           = 'info'
    domain             = ''
    domains            = @()
    webDomain          = ''
    dkimPrivateKeyPath = "$rootUnix/config/dkim/dkim.priv"
    sslType            = '1'
    SSLPrivateKeyPath  = "$rootUnix/config/ssl/private.key"
    SSLPublicKeyPath   = "$rootUnix/config/ssl/public.crt"
    dbDSN              = ''
    dbType             = 'sqlite'
    httpsEnabled       = 2
    httpPort           = $HttpPort
    httpsPort          = $HttpPort + 1
    spamFilterLevel    = 0
    isInit             = $false
}
# must be UTF-8 without BOM: Go's json.Unmarshal chokes on a BOM
$configJson = $config | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path $root 'config\config.json'), $configJson, (New-Object System.Text.UTF8Encoding($false)))

$env:PMail_ROOT = "$rootUnix/"
$env:setup_port = "$SetupPort"
$env:PMAIL_PORT_SMTP = '2025'
$env:PMAIL_PORT_SMTPS = '2465'
$env:PMAIL_PORT_SUBMISSION = '2587'
$env:PMAIL_PORT_IMAP = '2993'
$env:PMAIL_PORT_POP3 = '2110'
$env:PMAIL_PORT_POP3S = '2995'

Write-Host '==> starting pmail (setup mode)' -ForegroundColor Cyan
$logPath = Join-Path $root 'pmail.log'
$proc = Start-Process -FilePath $binary -WorkingDirectory $root -PassThru `
    -RedirectStandardOutput $logPath -RedirectStandardError (Join-Path $root 'pmail.err.log')

$setupUrl = "http://127.0.0.1:$SetupPort"
$httpUrl = "http://127.0.0.1:$HttpPort"

# Invoke-WebRequest + WebSession for cookies.
# Do NOT use .NET HttpClient with GetAwaiter().GetResult(): it deadlocks inside
# PowerShell and the script hangs on the very first request.
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# The setup API takes map[string]string, so build the JSON by hand.
# ConvertTo-Json in PowerShell 5.1 wraps plain strings as {"value": "..."} in some
# cases, which the Go side rejects with "cannot unmarshal object into ... string".
function Escape-JsonString {
    param([string]$Value)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $Value.ToCharArray()) {
        switch ($ch) {
            '"' { [void]$sb.Append('\"') }
            '\' { [void]$sb.Append('\\') }
            "`b" { [void]$sb.Append('\b') }
            "`f" { [void]$sb.Append('\f') }
            "`n" { [void]$sb.Append('\n') }
            "`r" { [void]$sb.Append('\r') }
            "`t" { [void]$sb.Append('\t') }
            default {
                if ([int]$ch -lt 32) { [void]$sb.Append(('\u{0:x4}' -f [int]$ch)) }
                else { [void]$sb.Append($ch) }
            }
        }
    }
    return $sb.ToString()
}

function ConvertTo-ApiJson {
    param([hashtable]$Body)
    $parts = @()
    foreach ($k in $Body.Keys) {
        $parts += ('"' + $k + '":"' + (Escape-JsonString ([string]$Body[$k])) + '"')
    }
    return '{' + ($parts -join ',') + '}'
}

function Invoke-Api {
    param([string]$Url, [hashtable]$Body = @{}, [int]$TimeoutSec = 30)
    $json = ConvertTo-ApiJson $Body
    # 需要发原生 JSON（例如数字字段）时，用 @{ __raw = '{"id":1}' } 直接透传
    if ($Body.ContainsKey('__raw')) { $json = [string]$Body['__raw'] }
    $text = ''
    $status = 0
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method POST -Body $json -ContentType 'application/json' `
            -WebSession $session -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
        $text = $resp.Content
        $status = [int]$resp.StatusCode
    } catch {
        $webResp = $_.Exception.Response
        if ($webResp) {
            $reader = New-Object System.IO.StreamReader($webResp.GetResponseStream())
            $text = $reader.ReadToEnd()
            $reader.Close()
            $status = [int]$webResp.StatusCode
        }
    }
    $obj = $null
    try { $obj = $text | ConvertFrom-Json } catch { }
    return [pscustomobject]@{ Status = $status; Text = $text; Json = $obj }
}

try {
    # ---------- 1. setup mode: only /api/setup works, everything else is 402 ----------
    $up = Wait-For { (Invoke-Api "$setupUrl/api/setup" @{ action = 'get'; step = 'database' }).Status -eq 200 } 40
    Check 'setup server is listening' $up $setupUrl
    if (-not $up) { throw "setup server did not come up, see $logPath" }

    $ping = Invoke-Api "$setupUrl/api/ping"
    Check 'before install /api/ping returns 402' ($ping.Json.errorNo -eq 402) $ping.Text

    $login = Invoke-Api "$setupUrl/api/login" @{ account = 'admin'; password = 'x' }
    Check 'before install /api/login returns 402 (login page blocked)' ($login.Json.errorNo -eq 402) $login.Text

    $static = Invoke-Api "$setupUrl/"
    Check 'setup page is served' ($static.Status -eq 200 -and $static.Text -match 'id="root"')

    # ---------- 2. domain ----------
    $setDomain = Invoke-Api "$setupUrl/api/setup" @{
        action = 'set'; step = 'domain'
        web_domain = 'mail.e2e.test'; smtp_domain = 'e2e.test'; multi_domain = ''
    }
    Check 'domain saved' ($setDomain.Json.errorNo -eq 0) $setDomain.Text

    $getDomain = Invoke-Api "$setupUrl/api/setup" @{ action = 'get'; step = 'domain' }
    Check 'domain read back' ($getDomain.Json.data.web_domain -eq 'mail.e2e.test') $getDomain.Text

    # ---------- 3. DNS: offline, fast, complete ----------
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $dns = Invoke-Api "$setupUrl/api/setup" @{ action = 'get'; step = 'dns' } 20
    $sw.Stop()
    $records = @($dns.Json.data.'e2e.test')
    $types = @($records | ForEach-Object { $_.type }) -join ','
    Check 'DNS records generated without network' ($dns.Json.errorNo -eq 0 -and $records.Count -ge 8) ("{0} records" -f $records.Count)
    Check 'DNS generation is local (<3s)' ($sw.Elapsed.TotalSeconds -lt 3) ("{0:N2}s" -f $sw.Elapsed.TotalSeconds)
    Check 'records include A/MX/TXT' ($types -match 'A' -and $types -match 'MX' -and $types -match 'TXT') $types
    $dkim = ($records | Where-Object { $_.type -eq 'TXT' -and $_.value -like 'v=DKIM1*' } | Select-Object -First 1)
    Check 'DKIM public key generated' ($null -ne $dkim -and $dkim.value.Length -gt 80)

    # ---------- 4. database ----------
    $dbPath = "$rootUnix/config/pmail.db"
    $setDb = Invoke-Api "$setupUrl/api/setup" @{ action = 'set'; step = 'database'; db_type = 'sqlite'; db_dsn = $dbPath }
    Check 'database saved' ($setDb.Json.errorNo -eq 0) $setDb.Text

    # ---------- 5. cert: load from fnOS (no fnOS dir here) ----------
    $fnos = Invoke-Api "$setupUrl/api/setup" @{ action = 'loadFnOsCert'; step = 'ssl' }
    Check 'missing fnOS cert dir gives a clear reason' ($fnos.Json.errorNo -eq 0 -and $fnos.Json.data.found -eq $false -and $fnos.Json.data.message) $fnos.Text
    Check 'install still not finished (login stays blocked)' ($fnos.Json.data.finished -ne $true) $fnos.Text

    # ---------- 6. admin account ----------
    $setPwd = Invoke-Api "$setupUrl/api/setup" @{ action = 'set'; step = 'password'; account = 'admin'; password = 'Passw0rd!e2e' }
    Check 'admin account created' ($setPwd.Json.errorNo -eq 0) $setPwd.Text

    # ---------- 7. finish without a certificate must be refused ----------
    $early = Invoke-Api "$setupUrl/api/setup" @{ action = 'finish'; step = 'ssl' }
    Check 'finish refused without certificate, with reason' ($early.Json.errorNo -eq 0 -and $early.Json.data.finished -eq $false -and $early.Json.data.reason) $early.Text

    # ---------- 8. paste own certificate ----------
    $certDir = Join-Path $ws '.tmp\e2e-cert'
    if (Test-Path $certDir) { Remove-Item $certDir -Recurse -Force }
    Push-Location $ws
    try {
        & $GoExe run (Join-Path $ws 'tools\gen-selfsigned.go') -out $certDir -cn mail.e2e.test -hosts 'mail.e2e.test,smtp.e2e.test' -ips '127.0.0.1' | Out-Null
    }
    finally { Pop-Location }
    $keyPem = [System.IO.File]::ReadAllText((Join-Path $certDir 'private.key'))
    $crtPem = [System.IO.File]::ReadAllText((Join-Path $certDir 'public.crt'))

    $badPair = Invoke-Api "$setupUrl/api/setup" @{ action = 'uploadCert'; step = 'ssl'; key = $crtPem; crt = $crtPem }
    Check 'mismatched key/cert is rejected' ($badPair.Json.data.found -eq $false -and $badPair.Json.data.message) $badPair.Text

    $upload = Invoke-Api "$setupUrl/api/setup" @{ action = 'uploadCert'; step = 'ssl'; key = $keyPem; crt = $crtPem }
    Check 'pasted certificate is installed' ($upload.Json.data.found -eq $true) $upload.Text
    Check 'cert summary shows domain/expiry' ($upload.Json.data.domain -eq 'mail.e2e.test' -and $upload.Json.data.expire) $upload.Text

    # ---------- 9. finish ----------
    # Installing the certificate is what finishes the wizard: the backend checks
    # domain + database + admin + certificate and then marks the install done,
    # after which the setup server shuts itself down.
    $finishedFlag = $upload.Json.data.finished
    if (-not $finishedFlag) {
        $finish = Invoke-Api "$setupUrl/api/setup" @{ action = 'finish'; step = 'ssl' }
        $finishedFlag = $finish.Json.data.finished
    }
    Check 'install finishes once everything is set' ($finishedFlag -eq $true) $upload.Text

    $installed = Wait-For { (Invoke-Api "$httpUrl/api/ping" @{} 5).Json.errorNo -eq 0 } 40
    Check 'main service is up (/api/ping 200)' $installed $httpUrl

    # ---------- 10. login + session ----------
    $login2 = Invoke-Api "$httpUrl/api/login" @{ account = 'admin'; password = 'Passw0rd!e2e' }
    Check 'login works' ($login2.Json.errorNo -eq 0 -and $login2.Json.data.account -eq 'admin') $login2.Text

    $info = Invoke-Api "$httpUrl/api/user/info"
    Check 'session works (/api/user/info)' ($info.Json.errorNo -eq 0) $info.Text

    $group = Invoke-Api "$httpUrl/api/group"
    Check 'folder list works' ($group.Json.errorNo -eq 0) $group.Text

    # ---------- 10b. settings: certificate status + reload policy ----------
    $sslInfo = Invoke-Api "$httpUrl/api/settings/ssl_info"
    Check 'settings ssl_info returns cert status' ($sslInfo.Json.errorNo -eq 0 -and $sslInfo.Json.data.domain -eq 'mail.e2e.test' -and $sslInfo.Json.data.expire) $sslInfo.Text
    Check 'ssl_info reports pasted source' ($sslInfo.Json.data.source -eq 'upload') $sslInfo.Text

    $reload = Invoke-Api "$httpUrl/api/settings/reload_cert"
    Check 'reload refuses to overwrite a pasted certificate' ($reload.Json.errorNo -ne 0 -and $reload.Json.errorMsg) $reload.Text

    # 管理员不能把自己停用（也不能把最后一个管理员停掉）
    $selfDisable = Invoke-Api "$httpUrl/api/user/edit" @{ __raw = '{"id":1,"account":"admin","username":"admin","disabled":1}' }
    Check 'admin cannot disable itself' ($selfDisable.Json.errorNo -ne 0) $selfDisable.Text

    # ---------- 10c. account: display name + password (self-service) ----------
    $profile = Invoke-Api "$httpUrl/api/user/profile" @{ name = 'E2E Admin' }
    Check 'user can change own display name' ($profile.Json.errorNo -eq 0 -and $profile.Json.data.name -eq 'E2E Admin') $profile.Text

    $badOld = Invoke-Api "$httpUrl/api/settings/modify_password" @{ old_password = 'wrong-one'; password = 'NewPassw0rd!e2e' }
    Check 'password change rejected when old password is wrong' ($badOld.Json.errorNo -ne 0) $badOld.Text

    $shortPwd = Invoke-Api "$httpUrl/api/settings/modify_password" @{ old_password = 'Passw0rd!e2e'; password = 'short' }
    Check 'password change rejected when too short' ($shortPwd.Json.errorNo -ne 0) $shortPwd.Text

    $chg = Invoke-Api "$httpUrl/api/settings/modify_password" @{ old_password = 'Passw0rd!e2e'; password = 'NewPassw0rd!e2e' }
    Check 'password change works with correct old password' ($chg.Json.errorNo -eq 0) $chg.Text

    $oldLogin = Invoke-Api "$httpUrl/api/login" @{ account = 'admin'; password = 'Passw0rd!e2e' }
    Check 'old password no longer works' ($oldLogin.Json.errorNo -ne 0) $oldLogin.Text

    $newLogin = Invoke-Api "$httpUrl/api/login" @{ account = 'admin'; password = 'NewPassw0rd!e2e' }
    Check 'new password works' ($newLogin.Json.errorNo -eq 0) $newLogin.Text

    # ---------- 11. on-disk result ----------
    $cfgAfter = Get-Content (Join-Path $root 'config\config.json') -Raw | ConvertFrom-Json
    Check 'config.json marked as installed' ($cfgAfter.isInit -eq $true)
    Check 'sslType pinned to user certificate' ($cfgAfter.sslType -eq '1') $cfgAfter.sslType
    Check 'cert paths are absolute' ([System.IO.Path]::IsPathRooted($cfgAfter.SSLPrivateKeyPath)) $cfgAfter.SSLPrivateKeyPath
    Check 'DKIM private key exists' (Test-Path (Join-Path $root 'config\dkim\dkim.priv'))
    Check 'database file created' (Test-Path (Join-Path $root 'config\pmail.db'))
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    Get-Process -Name 'pmail-e2e' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    if (-not $Keep -and (Test-Path $root)) {
        Start-Sleep -Milliseconds 300
        Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ---------- summary ----------
$failed = @($results | Where-Object { -not $_.Ok })
Write-Host ''
Write-Host ("==== result: {0}/{1} passed ====" -f ($results.Count - $failed.Count), $results.Count)
if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Host ("  FAIL " + $_.Name + "  " + $_.Detail) -ForegroundColor Red }
    if (-not $Keep) { Write-Host 're-run with -Keep to inspect .tmp\e2e logs' }
    exit 1
}
Write-Host 'PMail install flow acceptance test passed' -ForegroundColor Green
exit 0
