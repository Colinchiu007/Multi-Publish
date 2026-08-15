<#
.SYNOPSIS
    创建并打开 Multi-Publish 的独立任务 worktree。
.DESCRIPTION
    运行时代码任务的统一入口：校验共享主目录、安装并校验 Git hooks，
    再通过 session-init.sh 创建或复用 D 盘 worktree。
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
    [string]$TaskName,
    [switch]$NoDeps,
    [switch]$NoShell
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$bash = 'D:\Program Files\Git\usr\bin\bash.exe'
if (-not (Test-Path -LiteralPath $bash)) { throw "Git for Windows Bash 不存在: $bash" }
$primary = (& git -C $repo worktree list --porcelain | Where-Object { $_ -like 'worktree *' } | Select-Object -First 1).Substring(9)

function Invoke-RepoPowerShell([string]$script, [string[]]$arguments) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts/$script") @arguments
    if ($LASTEXITCODE -ne 0) { throw "$script 失败，退出码 $LASTEXITCODE" }
}

Invoke-RepoPowerShell 'mp-worktree-health.ps1' @('-Root', $primary, '-RequireClean', '-RequirePrimary')
Invoke-RepoPowerShell 'install-git-hooks.ps1' @()
Invoke-RepoPowerShell 'mp-worktree-health.ps1' @('-Root', $primary, '-RequireClean', '-RequireHooks', '-RequirePrimary')

if ($NoDeps) { $env:GWM_SKIP_DEPS = '1' }
try {
    $output = & $bash (Join-Path $repo 'scripts/session-init.sh') $TaskName 2>&1
    $exitCode = $LASTEXITCODE
} finally {
    Remove-Item Env:GWM_SKIP_DEPS -ErrorAction SilentlyContinue
}
if ($exitCode -ne 0) { $output | Write-Host; throw "session-init.sh 失败，退出码 $exitCode" }

$worktree = Join-Path 'D:\Data\projects\mp-worktrees' "mp-$TaskName"
if (-not (Test-Path -LiteralPath (Join-Path $worktree '.git'))) { throw "未找到创建后的 worktree: $worktree" }
Write-Host ($output -join [Environment]::NewLine)
Write-Host "任务 worktree: $worktree" -ForegroundColor Green
if (-not $NoShell -and $PSCmdlet.ShouldProcess($worktree, '打开独立 PowerShell')) {
    $command = "Set-Location -LiteralPath '$worktree'; Write-Host 'Multi-Publish isolated task: $TaskName' -ForegroundColor Green"
    Start-Process powershell.exe -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) -WorkingDirectory $worktree
}
