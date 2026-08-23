<#
.SYNOPSIS
    一键启用 Multi-Publish 共享主目录会话隔离写保护。
.DESCRIPTION
    在克隆了本仓库的新电脑上执行：安装 git hooks、注册 Windows 计划任务、启动
    Write Guard watcher、运行自检测试并通过健康门禁。脚本幂等，可重复运行；
    只写流程/计划任务，不修改运行时代码，不 push、不切换分支。
.PARAMETER Minutes
    健康巡检计划任务间隔（分钟），默认 15。
.PARAMETER WorktreeRoot
    隔离 worktree 根目录。默认取仓库父目录下的 mp-worktrees，
    也可通过环境变量 MP_WORKTREES 覆盖。
.PARAMETER GitBash
    Git for Windows 的 bash.exe。默认自动探测，也可通过 MP_GIT_BASH 覆盖。
.PARAMETER GitPath
    git.exe 的完整路径。默认自动探测，也可通过 MP_GIT 覆盖。
.PARAMETER SkipTests
    跳过两个自检测试，仅安装与健康检查。
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/bootstrap-write-guard.ps1
#>
[CmdletBinding()]
param(
    [ValidateRange(1,60)][int]$Minutes = 15,
    [string]$WorktreeRoot = '',
    [string]$GitBash = '',
    [string]$GitPath = '',
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Invoke-RepoScript {
    param(
        [Parameter(Mandatory)][string]$Script,
        [string[]]$Arguments
    )
    $target = Join-Path $repo "scripts/$Script"
    if (-not (Test-Path -LiteralPath $target)) { throw "script not found: $target" }
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $target @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Script failed with exit code $LASTEXITCODE" }
}

function Resolve-GitPath {
    param([string]$Configured)
    if (-not $Configured -and $env:MP_GIT) { $Configured = $env:MP_GIT }
    if (-not $Configured) {
        $cmd = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($cmd -and $cmd.Source) { $Configured = $cmd.Source }
    }
    if (-not $Configured -or -not (Test-Path -LiteralPath $Configured)) {
        foreach ($candidate in @('C:\Program Files\Git\cmd\git.exe','C:\Program Files (x86)\Git\cmd\git.exe','D:\Program Files\Git\cmd\git.exe')) {
            if (Test-Path -LiteralPath $candidate) { $Configured = $candidate; break }
        }
    }
    if (-not $Configured -or -not (Test-Path -LiteralPath $Configured)) {
        throw '找不到 git.exe；请安装 Git for Windows，或通过 -GitPath / MP_GIT 指定'
    }
    return $Configured
}

function Resolve-GitBash {
    param([string]$Configured)
    if (-not $Configured -and $env:MP_GIT_BASH) { $Configured = $env:MP_GIT_BASH }
    if (-not $Configured) {
        $gitCmd = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($gitCmd -and $gitCmd.Source) {
            $candidate = Join-Path (Split-Path (Split-Path $gitCmd.Source -Parent) -Parent) 'usr\bin\bash.exe'
            if (Test-Path -LiteralPath $candidate) { $Configured = $candidate }
        }
    }
    if (-not $Configured) {
        foreach ($candidate in @('C:\Program Files\Git\usr\bin\bash.exe','C:\Program Files (x86)\Git\usr\bin\bash.exe','D:\Program Files\Git\usr\bin\bash.exe')) {
            if (Test-Path -LiteralPath $candidate) { $Configured = $candidate; break }
        }
    }
    if (-not $Configured -or -not (Test-Path -LiteralPath $Configured)) {
        throw '找不到 Git for Windows Bash；请安装 Git for Windows，或通过 -GitBash / MP_GIT_BASH 指定'
    }
    return $Configured
}

$git = Resolve-GitPath $GitPath
$bash = Resolve-GitBash $GitBash
$primaryLine = & $git -C $repo worktree list --porcelain | Where-Object { $_ -like 'worktree *' } | Select-Object -First 1
if (-not $primaryLine) { throw '无法从仓库解析主 worktree' }
$primary = $primaryLine.Substring(9)

$worktreeRoot = $WorktreeRoot
if (-not $worktreeRoot -and $env:MP_WORKTREES) { $worktreeRoot = $env:MP_WORKTREES }
if (-not $worktreeRoot) { $worktreeRoot = Join-Path (Split-Path -Parent $repo) 'mp-worktrees' }
if (-not [IO.Path]::IsPathRooted($worktreeRoot)) { $worktreeRoot = Join-Path $repo $worktreeRoot }
$worktreeRoot = [IO.Path]::GetFullPath($worktreeRoot)

Write-Host "== Multi-Publish session isolation bootstrap ==" -ForegroundColor Cyan
Write-Host "Repo:         $repo"
Write-Host "Primary:      $primary"
Write-Host "WorktreeRoot: $worktreeRoot"
Write-Host "Git:          $git"
Write-Host "GitBash:      $bash"

Write-Host ""
Write-Host "[1/5] Installing git hooks..."
Invoke-RepoScript 'install-git-hooks.ps1'

if ($SkipTests) {
    Write-Host ""
    Write-Host "[2/5] Skipped self tests (-SkipTests)"
} else {
    Write-Host ""
    Write-Host "[2/5] Running session isolation self tests..."
    Invoke-RepoScript 'session-write-guard.test.ps1'
    Invoke-RepoScript 'session-isolation-automation.test.ps1'
}

Write-Host ""
Write-Host "[3/5] Registering scheduled tasks..."
Invoke-RepoScript 'install-session-isolation-task.ps1' @('-Minutes', "$Minutes", '-GitPath', $git)

Write-Host ""
Write-Host "[4/5] Starting Write Guard watcher..."
$guardTask = Get-ScheduledTask -TaskPath '\Multi-Publish\' -TaskName 'Session Isolation Write Guard' -ErrorAction SilentlyContinue
if (-not $guardTask) { throw 'Write Guard 计划任务注册失败' }
$running = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*guard-shared-root-writes.ps1*' }).Count -gt 0
if (-not $running) {
    Start-ScheduledTask -TaskName $guardTask.TaskName -TaskPath $guardTask.TaskPath | Out-Null
}
$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Seconds 2
    $running = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*guard-shared-root-writes.ps1*' }).Count -gt 0
} while (-not $running -and (Get-Date) -lt $deadline)
if (-not $running) { throw 'Write Guard watcher 未在 30 秒内启动' }
Write-Host "Write Guard watcher is running"

Write-Host ""
Write-Host "[5/5] Health gate..."
$report = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Multi-Publish\session-isolation\bootstrap-health.json'
Invoke-RepoScript 'mp-worktree-health.ps1' @('-Root', $primary, '-ReportPath', $report, '-WorktreeRoot', $worktreeRoot, '-GitPath', $git, '-RequireClean', '-RequireHooks', '-RequirePrimary', '-RequireWriteGuard', '-Quiet')

Write-Host ""
Write-Host "Bootstrap OK: hooks installed, tasks registered, watcher running, health ok=true" -ForegroundColor Green
Write-Host "Verify anytime:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/mp-worktree-health.ps1 -RequireWriteGuard"
Write-Host "  Get-ScheduledTask -TaskPath '\Multi-Publish\'"
Write-Host "First runtime task:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/start-mp-task.ps1 -TaskName <kebab-case>"