<#
.SYNOPSIS
    Upload and install the PMail fpk on a fnOS box, then verify it.

.DESCRIPTION
    Uses the trim-cli skill (OAuth session saved locally) to:
      1) uninstall an existing pmail (ignored when absent)
      2) install the fpk with --volume-id <id>
      3) poll until the app reports running
      4) verify over HTTP: setup page served, /api/ping answers 402 (not installed yet),
         /api/setup works, DNS records generate offline, fnOS certificate can be loaded

    You must pass -Address (and a trim-cli profile that is already logged in).
    Nothing about your own NAS is hard-coded here.

    NOTE: ASCII-only on purpose (Windows PowerShell 5.1 + no BOM = ANSI parsing).

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\deploy-fnos.ps1 -Address 10.0.0.10
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\deploy-fnos.ps1 -Address 10.0.0.10 -Profile home -VolumeId 1
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Address,
    [string]$Profile = "default",
    [string]$Fpk = "",
    [int]$VolumeId = 1,
    [int]$WebPort = 8080,
    [int]$ApiPort = 5667,
    [switch]$SkipUninstall
)

$ErrorActionPreference = 'Stop'
$ws = Split-Path -Parent $PSScriptRoot
if (-not $ws) { $ws = (Get-Location).Path }

$TrimCli = Join-Path $env:USERPROFILE '.dsh\skills\fnos\scripts\trim-cli.cmd'
if (-not (Test-Path $TrimCli)) { throw "trim-cli not found: $TrimCli (install the fnos skill first)" }

if (-not $Fpk) {
    $candidate = Get-ChildItem (Join-Path $ws 'release') -Filter 'pmail-*-x86.fpk' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $candidate) { throw 'no release/pmail-*-x86.fpk found, run tools\build-fpk.ps1 first' }
    $Fpk = $candidate.FullName
}
if (-not (Test-Path $Fpk)) { throw "fpk not found: $Fpk" }
$Fpk = (Resolve-Path $Fpk).Path

$results = New-Object System.Collections.Generic.List[object]
function Check {
    param([string]$Name, [bool]$Ok, [string]$Detail = '')
    $script:results.Add([pscustomobject]@{ Name = $Name; Ok = $Ok; Detail = $Detail })
    if ($Ok) { Write-Host ("  [PASS] " + $Name) -ForegroundColor Green }
    else { Write-Host ("  [FAIL] " + $Name + "  " + $Detail) -ForegroundColor Red }
}

function Invoke-Trim {
    param([string[]]$TrimArgs)
    # native stderr must not abort the script (ErrorActionPreference=Stop would)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $TrimCli @TrimArgs 2>&1 | ForEach-Object { $_.ToString() }
        $code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $prev }
    return [pscustomobject]@{ Output = ($out -join "`n"); Code = $code }
}

function Invoke-Api {
    param([string]$Url, [string]$JsonBody = '{}', [int]$TimeoutSec = 20)
    $text = ''
    $status = 0
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method POST -Body $JsonBody -ContentType 'application/json' `
            -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
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

Write-Host "==> target $Address (profile $Profile)" -ForegroundColor Cyan
Write-Host "==> fpk $Fpk" -ForegroundColor Cyan
Write-Host ("    size {0:N1} MB" -f ((Get-Item $Fpk).Length / 1MB))

$conn = @('--profile', $Profile, '--host', $Address, '--port', "$ApiPort", '--scheme', 'https', '--tls-insecure')

$info = Invoke-Trim (@($conn) + @('system', 'info'))
Check 'device reachable via trim-cli' ($info.Code -eq 0) ($info.Output.Trim())

if (-not $SkipUninstall) {
    Write-Host '==> uninstall previous pmail (ok if absent)' -ForegroundColor Cyan
    $un = Invoke-Trim (@($conn) + @('app', 'uninstall', 'pmail', '--yes'))
    Write-Host ("    " + ($un.Output -replace "`n", ' ').Trim())
    Start-Sleep -Seconds 2
}

Write-Host '==> install fpk' -ForegroundColor Cyan
$inst = Invoke-Trim (@($conn) + @('app', 'install-fpk', $Fpk, '--volume-id', "$VolumeId", '--accept-license', '--yes'))
Check 'install-fpk accepted' ($inst.Code -eq 0) ($inst.Output.Trim())
if ($inst.Code -ne 0) {
    Write-Host $inst.Output
    exit 1
}

Write-Host '==> waiting for the app to report running' -ForegroundColor Cyan
$running = $false
$lastStatus = ''
for ($i = 0; $i -lt 40; $i++) {
    $st = Invoke-Trim (@($conn) + @('app', 'status', 'pmail'))
    $lastStatus = $st.Output
    if ($st.Code -eq 0 -and ($st.Output -match '"status"\s*:\s*"running"')) { $running = $true; break }
    Start-Sleep -Seconds 3
}
Check 'app is running' $running ($lastStatus -replace "`n", ' ')

$base = "http://$Address`:$WebPort"
$ping = Invoke-Api "$base/api/ping"
Check 'web port answers' ($ping.Status -eq 200) "$base/api/ping -> $($ping.Text)"

$page = $null
try {
    $page = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 20
} catch { }
Check 'SPA page served' ($page -ne $null -and $page.Content -match 'id="root"') $base

# The device may already be installed (the data dir survives uninstall), so accept both states.
if ($ping.Json.errorNo -eq 402) {
    Check 'not installed yet -> /api/ping 402 (login blocked)' $true $ping.Text

    $setupDb = Invoke-Api "$base/api/setup" '{"action":"get","step":"database"}'
    Check '/api/setup works' ($setupDb.Json.errorNo -eq 0) $setupDb.Text

    $dns = Invoke-Api "$base/api/setup" '{"action":"get","step":"dns"}'
    Check 'DNS endpoint answers offline' ($dns.Json.errorNo -eq 0) $dns.Text

    $fnos = Invoke-Api "$base/api/setup" '{"action":"loadFnOsCert","step":"ssl"}' 30
    $found = $fnos.Json.data.found
    if ($found -eq $true) {
        Check 'fnOS certificate loaded' $true ("domain=" + $fnos.Json.data.domain + " expire=" + $fnos.Json.data.expire)
    } else {
        Write-Host ("  [WARN] fnOS certificate not loaded: " + $fnos.Json.data.message) -ForegroundColor Yellow
        Check 'fnOS cert lookup answered (no cert on device)' ($null -ne $fnos.Json.data) $fnos.Text
    }
} else {
    Check 'already installed -> /api/ping 200' ($ping.Json.errorNo -eq 0) $ping.Text

    $unauth = Invoke-Api "$base/api/user/info"
    Check 'unauthenticated API is blocked' ($unauth.Json.errorNo -eq 403) $unauth.Text

    $login = Invoke-Api "$base/api/login" '{"account":"__probe__","password":"__probe__"}'
    Check 'login endpoint answers (wrong credentials rejected)' ($login.Json.errorNo -ne 0) $login.Text

    Write-Host '  [INFO] device already finished setup; wizard checks skipped (data dir kept)' -ForegroundColor Cyan
}

$failed = @($results | Where-Object { -not $_.Ok })
Write-Host ''
Write-Host ("==== result: {0}/{1} passed ====" -f ($results.Count - $failed.Count), $results.Count)
Write-Host ("entry: fnOS desktop -> PMail, or $base/")
if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Host ("  FAIL " + $_.Name + "  " + $_.Detail) -ForegroundColor Red }
    exit 1
}
exit 0
