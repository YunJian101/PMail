<#
.SYNOPSIS
    PMail React 版一键构建（Windows）。

.DESCRIPTION
    1) 构建 web/ 下的 React 前端
    2) 把产物拷到 server/listen/http_server/dist（go:embed 目录）
    3) 编译 Go 后端为单个可执行文件 pmail.exe

    前置条件：PATH 里能找到 node / pnpm / go。
    只构建其中一半时用 -SkipWeb 或 -SkipServer。

.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File .\build.ps1

.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File .\build.ps1 -SkipWeb -Output .\out\pmail.exe
#>
param(
    [switch]$SkipWeb,
    [switch]$SkipServer,
    [string]$Output = ""
)

$ErrorActionPreference = 'Stop'
$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

function Assert-Command([string]$name, [string]$hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "找不到 $name。$hint"
    }
}

if (-not $SkipWeb) {
    Assert-Command pnpm '请先安装 pnpm（或把 pnpm 所在目录加入 PATH）。'
    Write-Host '==> 安装前端依赖' -ForegroundColor Cyan
    Push-Location (Join-Path $root 'web')
    try {
        pnpm install
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install 失败' }
        Write-Host '==> 构建前端' -ForegroundColor Cyan
        pnpm build
        if ($LASTEXITCODE -ne 0) { throw 'pnpm build 失败' }
    }
    finally { Pop-Location }

    $embed = Join-Path $root 'server\listen\http_server\dist'
    Write-Host "==> 拷贝产物到 $embed" -ForegroundColor Cyan
    if (Test-Path $embed) { Remove-Item $embed -Recurse -Force }
    New-Item -ItemType Directory -Path $embed -Force | Out-Null
    Copy-Item (Join-Path $root 'web\dist\*') $embed -Recurse -Force
}

if (-not $SkipServer) {
    Assert-Command go '请先安装 Go 1.21+ 并加入 PATH。'
    $out = if ($Output) { $Output } else { Join-Path $root 'pmail.exe' }
    Write-Host "==> 编译后端 -> $out" -ForegroundColor Cyan
    Push-Location (Join-Path $root 'server')
    try {
        $env:CGO_ENABLED = '0'
        go build -trimpath -ldflags '-s -w' -o $out main.go
        if ($LASTEXITCODE -ne 0) { throw 'go build 失败' }
    }
    finally { Pop-Location }
    Write-Host "完成：$out" -ForegroundColor Green
}
