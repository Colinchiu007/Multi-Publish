<#
.SYNOPSIS
    声明当前会话的期望提交分支，供 pre-commit 分支守卫校验。
.DESCRIPTION
    在共享主工作区开始时运行，把期望分支写入 .agent_context/expected-branch（+ session.json 元数据）。
    pre-commit 钩子（scripts/hooks/pre-commit）会强制校验当前分支与声明一致，
    docs-only 提交同样校验，防止共享工作区被并发会话切换后提交落到错误分支。
    隔离 worktree 由钩子自动声明，无需运行本脚本。
    防覆盖：若已有另一活跃会话的声明（session.json 中 pid 存活），拒绝覆盖（除非 -Force）。
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/session-guard.ps1 -Branch main
    powershell -ExecutionPolicy Bypass -File scripts/session-guard.ps1          # 自动使用当前分支
#>
param(
    [string]$Branch,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$root = git rev-parse --show-toplevel
if (-not $root) {
    Write-Error "当前目录不在 git 仓库内，无法写入会话声明。"
    exit 1
}

# 未指定分支时自动使用当前分支（共享主工作区场景：运行瞬间的意图即当前分支）
if (-not $Branch) {
    $Branch = git branch --show-current
    if (-not $Branch) {
        Write-Error "当前 HEAD 未指向任何命名分支，请显式指定 -Branch <分支名>。"
        exit 1
    }
    Write-Host "[session-guard] 未指定 -Branch，自动使用当前分支: $Branch"
}

# 校验分支存在（本地或远端，精确匹配，避免后缀通配误判）
$local = git for-each-ref --format='%(refname:short)' "refs/heads/$Branch"
$remote = git for-each-ref --format='%(refname:short)' "refs/remotes/*/$Branch"
if (-not $local -and -not $remote -and -not $Force) {
    Write-Error "分支 '$Branch' 不存在（本地/远端均未找到）。请确认拼写；确要声明请加 -Force。"
    exit 1
}

$ctx = Join-Path $root '.agent_context'
$expectedFile = Join-Path $ctx 'expected-branch'
$sessionFile = Join-Path $ctx 'session.json'

# 防覆盖：共享工作区只允许一个活跃会话持有声明（否则并发会话覆盖声明会让守卫 fail-open）
if (-not $Force -and (Test-Path $sessionFile)) {
    try {
        $existing = Get-Content $sessionFile -Raw | ConvertFrom-Json
        if ($existing.pid -and ([int]$existing.pid -ne $PID)) {
            $alive = Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue
            if ($alive) {
                Write-Error "检测到另一活跃会话已声明分支 '$($existing.branch)'（pid $($existing.pid)，startedAt $($existing.startedAt)）。共享工作区只允许一个会话持有声明，请改在独立 worktree 中工作；确要覆盖请加 -Force。"
                exit 1
            }
            Write-Warning "既有声明（pid $($existing.pid)）进程已不存在，视为过期，将覆盖为 '$Branch'。"
        }
    } catch {
        Write-Warning "无法解析既有 session.json（$($_.Exception.Message)），将覆盖声明。"
    }
}

New-Item -ItemType Directory -Force -Path $ctx | Out-Null

[System.IO.File]::WriteAllText($expectedFile, $Branch, (New-Object System.Text.UTF8Encoding($false)))

$session = @{
    pid       = $PID
    startedAt = (Get-Date).ToString('o')
    branch    = $Branch
    worktree  = (Get-Location).Path
} | ConvertTo-Json
[System.IO.File]::WriteAllText($sessionFile, $session, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "[session-guard] 会话分支声明已写入: $expectedFile"
Write-Host "[session-guard] 声明分支: $Branch（pre-commit 将强制校验当前分支一致）"