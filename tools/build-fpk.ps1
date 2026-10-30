<#
.SYNOPSIS
    Build the PMail fpk for fnOS: web -> embedded -> Go cross-compile -> fnpack.

.DESCRIPTION
    Steps:
      1) web: pnpm typecheck + build, copy dist into server/listen/http_server/dist (go:embed dir)
      2) backend: go build (sanity) + go test -p 1
      3) cross-compile linux/amd64 into packaging/fnos/pkg/app/pmail
      4) fnpack build -> release/pmail-<version>-x86.fpk + sha256

    Tools: .tools/go/bin/go.exe, .tools/fnpack.exe, node/pnpm from the DSH runtime.

    NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 reads
    .ps1 as ANSI unless there is a BOM, so non-ASCII text becomes a parse error.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-fpk.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-fpk.ps1 -SkipWeb -SkipTest
#>
param(
    [switch]$SkipWeb,
    [switch]$SkipTest,
    [string]$Version = ""
)

$ErrorActionPreference = 'Stop'
$ws = Split-Path -Parent $PSScriptRoot
if (-not $ws) { $ws = (Get-Location).Path }

function Resolve-Tool {
    param([string]$Name, [string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path $candidate)) { return (Resolve-Path $candidate).Path }
    }
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "$Name not found (put it in .tools or on PATH)"
}

$nodeRuntime = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies'
$GoExe = Resolve-Tool 'go' @((Join-Path $ws '.tools\go\bin\go.exe'))
$FnpackExe = Resolve-Tool 'fnpack' @((Join-Path $ws '.tools\fnpack.exe'))
$NodeExe = Resolve-Tool 'node' @((Join-Path $nodeRuntime 'node\bin\node.exe'))
$PnpmMjs = Resolve-Tool 'pnpm' @((Join-Path $nodeRuntime 'pnpm\bin\pnpm.mjs'))
$env:Path = (Split-Path -Parent $NodeExe) + ';' + $env:Path

# ---------- version ----------
$manifestPath = Join-Path $ws 'packaging\fnos\pkg\manifest'
if (-not $Version) {
    $line = Select-String -Path $manifestPath -Pattern '^\s*version\s*=' | Select-Object -First 1
    if ($line) { $Version = ($line.Line -split '=', 2)[1].Trim() }
}
if (-not $Version) { throw 'no version in manifest' }
Write-Host "==> version $Version" -ForegroundColor Cyan

# ---------- go env (offline, local module cache) ----------
$env:GOPATH = Join-Path $ws '.tools\gopath'
$env:GOCACHE = Join-Path $ws '.tools\gocache'
$env:GOTMPDIR = Join-Path $ws '.tools\gotmp'
$env:GOPROXY = 'off'
$env:GOFLAGS = '-mod=mod'
New-Item -ItemType Directory -Force -Path $env:GOPATH, $env:GOCACHE, $env:GOTMPDIR | Out-Null

# ---------- 1) web ----------
if (-not $SkipWeb) {
    Write-Host '==> web typecheck' -ForegroundColor Cyan
    Push-Location (Join-Path $ws 'web')
    try {
        & $NodeExe $PnpmMjs typecheck
        if ($LASTEXITCODE -ne 0) { throw 'web typecheck failed' }
        Write-Host '==> web build' -ForegroundColor Cyan
        & $NodeExe $PnpmMjs build
        if ($LASTEXITCODE -ne 0) { throw 'web build failed' }
    }
    finally { Pop-Location }

    $embed = Join-Path $ws 'server\listen\http_server\dist'
    Write-Host "==> copy web dist into $embed" -ForegroundColor Cyan
    if (Test-Path $embed) { Remove-Item "$embed\*" -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $embed | Out-Null
    Copy-Item (Join-Path $ws 'web\dist\*') $embed -Recurse -Force
}

# ---------- 2) backend build + tests ----------
Push-Location (Join-Path $ws 'server')
try {
    Write-Host '==> go build' -ForegroundColor Cyan
    & $GoExe build ./...
    if ($LASTEXITCODE -ne 0) { throw 'go build failed' }

    if (-not $SkipTest) {
        Write-Host '==> go test -p 1 ./...' -ForegroundColor Cyan
        # mail ports on high numbers so the test run needs no admin rights
        $env:PMAIL_PORT_SMTP = '2025'
        $env:PMAIL_PORT_SMTPS = '2465'
        $env:PMAIL_PORT_SUBMISSION = '2587'
        $env:PMAIL_PORT_IMAP = '2993'
        $env:PMAIL_PORT_POP3 = '2110'
        $env:PMAIL_PORT_POP3S = '2995'
        & $GoExe test -p 1 ./...
        if ($LASTEXITCODE -ne 0) { throw 'go test failed' }
    }
}
finally { Pop-Location }

# ---------- 3) cross-compile ----------
$appDir = Join-Path $ws 'packaging\fnos\pkg\app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
$binPath = Join-Path $appDir 'pmail'
Write-Host "==> cross-compile linux/amd64 -> $binPath" -ForegroundColor Cyan
Push-Location (Join-Path $ws 'server')
try {
    $env:CGO_ENABLED = '0'
    $env:GOOS = 'linux'
    $env:GOARCH = 'amd64'
    # 版本号注入：单一来源就是 manifest 里的 version，前端 /api/version 与启动日志都读它
$buildTime = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$gitHash = 'local'
if (Test-Path (Join-Path $ws '.git')) {
    $hash = (& git -C $ws rev-parse --short HEAD 2>$null)
    if ($LASTEXITCODE -eq 0 -and $hash) { $gitHash = $hash.Trim() }
}
$ldflags = "-s -w -X github.com/Jinnrry/pmail/utils/version.Version=$Version -X github.com/Jinnrry/pmail/utils/version.BuildTime=$buildTime -X github.com/Jinnrry/pmail/utils/version.GitHash=$gitHash"
Write-Host "==> ldflags: version=$Version build=$buildTime hash=$gitHash" -ForegroundColor DarkGray
& $GoExe build -trimpath -ldflags $ldflags -o $binPath .
    if ($LASTEXITCODE -ne 0) { throw 'cross-compile failed' }
}
finally {
    Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
    Pop-Location
}
Write-Host ("    size {0:N1} MB" -f ((Get-Item $binPath).Length / 1MB))

# ---------- 4) pack ----------
Write-Host '==> fnpack build' -ForegroundColor Cyan
$pkgDir = Join-Path $ws 'packaging\fnos\pkg'
$fnpackTmp = Join-Path $ws '.tmp\fnpack'
New-Item -ItemType Directory -Force -Path $fnpackTmp | Out-Null
$env:TEMP = $fnpackTmp
$env:TMP = $fnpackTmp
Push-Location $pkgDir
try {
    & $FnpackExe build
    if ($LASTEXITCODE -ne 0) { throw 'fnpack build failed' }
}
finally { Pop-Location }

$built = Join-Path $pkgDir 'pmail.fpk'
if (-not (Test-Path $built)) { throw "fnpack produced no $built" }

$releaseDir = Join-Path $ws 'release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$target = Join-Path $releaseDir ("pmail-{0}-x86.fpk" -f $Version)
Copy-Item $built $target -Force
$hash = (Get-FileHash $target -Algorithm SHA256).Hash
Set-Content -Path "$target.sha256" -Value ("{0}  {1}" -f $hash.ToLower(), (Split-Path -Leaf $target)) -Encoding ascii

Write-Host ''
Write-Host "done: $target" -ForegroundColor Green
Write-Host ("      {0:N1} MB  sha256={1}" -f ((Get-Item $target).Length / 1MB), $hash.ToLower())
