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
    # 身份校验：Git for Windows 的 bash.exe 必在 <GitRoot>\usr\bin\bash.exe 或
    # <GitRoot>\bin\bash.exe，且同根 usr\bin\dirname.exe 存在；WSL shim
    # （system32\bash.exe）路径模式不符，直接拒绝（裸 bash 解析到 WSL 时
    # 无 dirname/cygpath/awk，session-init.sh 会以 `dirname: command not found` 失败）。
    function Test-GitBashIdentity([string]$candidate) {
        if (-not $candidate -or -not (Test-Path -LiteralPath $candidate)) { return $false }
        $gitRoot = $null
        foreach ($rel in @('usr\bin\bash.exe', 'bin\bash.exe')) {
            if ($candidate -like "*\$rel") {
                $gitRoot = $candidate.Substring(0, $candidate.Length - $rel.Length).TrimEnd('\')
                break
            }
        }
        if (-not $gitRoot) { return $false }
        return (Test-Path -LiteralPath (Join-Path $gitRoot 'usr\bin\dirname.exe'))
    }
    if (-not $Configured -and $env:MP_GIT_BASH) { $Configured = $env:MP_GIT_BASH }
    if ($Configured -and -not (Test-GitBashIdentity $Configured)) {
        throw "指定的 bash 不是 Git for Windows Bash（$Configured）；请通过 -GitBash / MP_GIT_BASH 指定 <GitRoot>\usr\bin\bash.exe，禁止使用 WSL/裸 bash"
    }
    if (-not $Configured) {
        $gitCmd = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($gitCmd -and $gitCmd.Source) {
            $candidate = Join-Path (Split-Path (Split-Path $gitCmd.Source -Parent) -Parent) 'usr\bin\bash.exe'
            if (Test-GitBashIdentity $candidate) { $Configured = $candidate }
        }
    }
    if (-not $Configured) {
        foreach ($candidate in @('C:\Program Files\Git\usr\bin\bash.exe','C:\Program Files (x86)\Git\usr\bin\bash.exe','D:\Program Files\Git\usr\bin\bash.exe')) {
            if (Test-GitBashIdentity $candidate) { $Configured = $candidate; break }
        }
    }
    if (-not $Configured) {
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
$guardTask = Get-ScheduledTask -TaskPath '\Mulpub\' -TaskName 'Session Isolation Write Guard' -ErrorAction SilentlyContinue
if (-not $guardTask) { throw 'Write Guard 计划任务注册失败' }
# 守护是否在跑，不得靠读进程 CommandLine 判：主体为 S4U（非交互）时 watcher 在别的 session，
# 非提权调用取它的 CommandLine 只会拿到 $null，于是把**正在执法**的守护判成未运行——这里原判据
# 还会据此重复 Start-ScheduledTask，并在 30 秒后 throw「watcher 未启动」，把健康机器判成装配失败。
# 任务自身的 State 与 session 无关，故取它为主判据；进程命令行匹配只作交互档下的佐证。
function Test-GuardRunning {
    param($Task)
    $cur = Get-ScheduledTask -TaskPath $Task.TaskPath -TaskName $Task.TaskName -ErrorAction SilentlyContinue
    if ($cur -and ([string]$cur.State) -eq 'Running') { return $true }
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*guard-shared-root-writes.ps1*' })
    return ($procs.Count -gt 0)
}
$running = Test-GuardRunning -Task $guardTask
if (-not $running) {
    Start-ScheduledTask -TaskName $guardTask.TaskName -TaskPath $guardTask.TaskPath | Out-Null
}
$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Seconds 2
    $running = Test-GuardRunning -Task $guardTask
} while (-not $running -and (Get-Date) -lt $deadline)
if (-not $running) { throw 'Write Guard watcher 未在 30 秒内启动' }
Write-Host "Write Guard watcher is running"

Write-Host ""
Write-Host "[5/5] Health gate..."
$report = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Mulpub\session-isolation\bootstrap-health.json'
Invoke-RepoScript 'mp-worktree-health.ps1' @('-Root', $primary, '-ReportPath', $report, '-WorktreeRoot', $worktreeRoot, '-GitPath', $git, '-RequireClean', '-RequireHooks', '-RequirePrimary', '-RequireWriteGuard', '-Quiet')

Write-Host ""
Write-Host "Bootstrap OK: hooks installed, tasks registered, watcher running, health ok=true" -ForegroundColor Green
Write-Host "Verify anytime:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/mp-worktree-health.ps1 -RequireWriteGuard"
Write-Host "  Get-ScheduledTask -TaskPath '\Mulpub\'"
Write-Host "First runtime task:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/start-mp-task.ps1 -TaskName <kebab-case>"