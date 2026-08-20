<#
.SYNOPSIS
  Prepare a worktree's dependencies with reuse (pnpm store offline + idempotent electron).
.DESCRIPTION
  Worktrees share the pnpm global store via hard links: this is the supported
  "soft-link-like" reuse. We do NOT junction whole node_modules (forbidden:
  it makes @multi-publish/* resolve to another checkout = dual module instance;
  see scripts/fix-worktree-node-modules.sh).

  Flow:
    1. If node_modules exists and verify-worktree-deps passes -> done (fast).
    2. pnpm install --offline --frozen-lockfile (falls back to online on miss).
    3. node scripts/ensure-electron.js (idempotent; skips download when dist exists).
    4. node scripts/verify-worktree-deps.js gate.

  Usage: powershell -ExecutionPolicy Bypass -File scripts/prepare-worktree-deps.ps1 -Worktree <dir>
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Worktree,
    [switch]$Online
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Worktree)) { throw "worktree not found: $Worktree" }
Push-Location $Worktree
try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    function Have-ValidDeps {
        $nm = Join-Path $Worktree 'node_modules'
        if (-not (Test-Path -LiteralPath $nm)) { return $false }
        & node (Join-Path $Worktree 'scripts\verify-worktree-deps.js') 2>$null
        return ($LASTEXITCODE -eq 0)
    }
    if (Have-ValidDeps) {
        Write-Host ("[prepare] deps already ready and verified (pnpm store reuse). elapsed={0}s" -f [math]::Round($sw.Elapsed.TotalSeconds, 1))
        return
    }
    Write-Host "[prepare] installing deps (pnpm store reuse)..."
    if ($Online) {
        & pnpm install --frozen-lockfile
    }
    else {
        & pnpm install --offline --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "offline install failed, retrying online..."
            & pnpm install --frozen-lockfile
        }
    }
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
    & node (Join-Path $Worktree 'scripts\ensure-electron.js')
    if ($LASTEXITCODE -ne 0) { throw "ensure-electron failed" }
    & node (Join-Path $Worktree 'scripts\verify-worktree-deps.js')
    if ($LASTEXITCODE -ne 0) { throw "verify-worktree-deps failed" }
    Write-Host ("[prepare] deps ready. elapsed={0}s" -f [math]::Round($sw.Elapsed.TotalSeconds, 1))
}
finally {
    Pop-Location
}
