<#
.SYNOPSIS
    Pre-flight guard: verify cwd is not the shared main directory before code edits.
.DESCRIPTION
    Call before any apply_patch / git add / file modification.
    Exit 0 = pass (worktree or non-git), Exit 1 = blocked (shared main root).
#>
$ErrorActionPreference = 'Stop'

try {
    $gitDir = (git rev-parse --git-dir 2>$null).Trim()
    $commonDir = (git rev-parse --git-common-dir 2>$null).Trim()
} catch {
    Write-Host "[pre-code-edit-guard] Cannot get git info, skipping check." -ForegroundColor Yellow
    exit 0
}

if (-not $gitDir -or -not $commonDir) {
    Write-Host "[pre-code-edit-guard] Not in a git repo, skipping check." -ForegroundColor Yellow
    exit 0
}

# Isolated worktree: git-dir != git-common-dir -> PASS
if ($gitDir -ne $commonDir) {
    exit 0
}

# Shared main root: git-dir == git-common-dir -> BLOCK
Write-Host ""
Write-Host "[pre-code-edit-guard] BLOCKED: You are in the shared main directory." -ForegroundColor Red
Write-Host "  Runtime code changes are NOT allowed here." -ForegroundColor Red
Write-Host ""
Write-Host "  Correct flow:" -ForegroundColor Yellow
Write-Host "    1) Create worktree:  bash scripts/session-init.sh <task-name>"
Write-Host "    2) Make changes inside the worktree"
    # 读取 .agent_context/write-guard-alert.json（watcher 在隔离动作时写入），
    # 提示会话已发生违规并停止在共享根编辑。
    $alertPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.agent_context\write-guard-alert.json'
    if (Test-Path -LiteralPath $alertPath) {
        try {
            $alert = Get-Content -LiteralPath $alertPath -Raw -Encoding UTF8 | ConvertFrom-Json
            Write-Host ""
            Write-Host "[pre-code-edit-guard] WRITE-GUARD VIOLATIONS DETECTED." -ForegroundColor Red
            Write-Host "  Last: $($alert.action) @ $($alert.path) ($($alert.ts))" -ForegroundColor Yellow
            Write-Host "  $($alert.hint)" -ForegroundColor Yellow
        } catch {
            Write-Host "[pre-code-edit-guard] Failed to read write-guard-alert.json: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

Write-Host ""
exit 1