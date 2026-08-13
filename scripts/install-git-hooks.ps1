<#
.SYNOPSIS
    把仓库内 scripts/hooks/ 下的 git 钩子同步安装到共享 .git/hooks/。
.DESCRIPTION
    钩子源文件以版本控制为准（scripts/hooks/），本脚本负责安装/更新到实际生效的
    $GIT_COMMON_DIR/hooks。所有 worktree 共享同一 hooks 目录，一次安装全局生效。
    跳过 *.test.* 等非钩子文件。支持从仓库任意子目录运行。
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/install-git-hooks.ps1
#>
$ErrorActionPreference = 'Stop'

$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) {
    Write-Error "当前目录不在 git 仓库内。"
    exit 1
}

# 解析 git 公共目录为绝对路径（从子目录运行时 --git-common-dir 返回相对路径，必须用绝对形式，否则会装错位置）
$commonDir = git rev-parse --path-format=absolute --git-common-dir 2>$null
if (-not $commonDir) {
    $commonDir = git rev-parse --git-common-dir
    $commonDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $commonDir))
}
if (-not (Test-Path (Join-Path $commonDir 'HEAD'))) {
    Write-Error "git 公共目录解析异常: $commonDir（缺少 HEAD，疑似相对路径错位）。请从仓库根目录重试。"
    exit 1
}

$src = Join-Path $repoRoot 'scripts/hooks'
$dst = Join-Path $commonDir 'hooks'
if (-not (Test-Path $src)) {
    Write-Error "未找到钩子源目录: $src"
    exit 1
}
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Get-ChildItem $src -File | Where-Object { $_.Name -notlike '*.test.*' } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dst $_.Name) -Force
    Write-Host "[install-git-hooks] 已安装: $(Join-Path $dst $_.Name)"
}