<#
.SYNOPSIS
    Restore deleted files in a workspace (AGENTS.md guardrail R2; hardened 2026-08-28).

.DESCRIPTION
    Restores files reported as deleted by `git status`, one path at a time, so that
    uncommitted modifications in the same directories are never clobbered - which is what
    `git checkout -- <directory>` / `git restore <directory>` would do.

    Hardened 2026-08-28 against a VERIFIED total-failure bug: the previous version used
    `git checkout -- <path>`, which restores from the INDEX. For a staged delete (`D `)
    the file no longer exists in the index, so git failed with
    "pathspec ... did not match any file(s) known to git"; combined with
    $ErrorActionPreference='Stop' this aborted the whole run, so NOTHING was restored -
    including files that would have been recoverable.

    Fix: restore from HEAD (`git checkout HEAD -- <path>`), which covers both worktree
    deletes (` D`) and staged deletes (`D `). Also: per-file error isolation so one failure
    cannot abort the rest, quote-aware status parsing, and -WhatIf.

.PARAMETER MainWorkspace
    Workspace to restore in. Auto-derived via `git rev-parse --git-common-dir`.

.PARAMETER Force
    Also restore paths whose INDEX holds content that HEAD does not (status such as `MD`).
    Restoring those discards the staged modification. Without -Force they are reported
    and skipped.

.PARAMETER WhatIf
    Print what would be restored; change nothing.

.EXAMPLE
    safe-restore-deleted.ps1 -WhatIf
    safe-restore-deleted.ps1
    safe-restore-deleted.ps1 -Force
#>
param(
    [string]$MainWorkspace = "",
    [switch]$Force,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Continue'

function Norm([string]$p) { if (-not $p) { return '' }; return (($p -replace '/', '\').TrimEnd('\')) }

# ---------------- resolve workspace ----------------
if (-not $MainWorkspace) {
    $gcd = (& git rev-parse --git-common-dir 2>$null).Trim()
    if ($gcd) {
        $base = if ([System.IO.Path]::IsPathRooted($gcd)) { $gcd } else { Join-Path (Get-Location).Path $gcd }
        $MainWorkspace = Split-Path -Path (Norm ([System.IO.Path]::GetFullPath($base))) -Parent
    }
}
if (-not $MainWorkspace) { Write-Host "FATAL: cannot derive workspace; pass -MainWorkspace."; exit 1 }

$main = Norm ([System.IO.Path]::GetFullPath($MainWorkspace))
if (-not (Test-Path -LiteralPath $main)) { Write-Host "FATAL: workspace not found: $main"; exit 1 }
$inside = (& git -C $main rev-parse --is-inside-work-tree 2>$null)
if ($LASTEXITCODE -ne 0 -or $inside -notmatch 'true') {
    Write-Host "FATAL: not a git working tree: $main"; exit 1
}

# core.quotePath=false -> paths are emitted raw, so Substring(3) is safe even for
# non-ASCII / spaces / quotes.
$status = @(git -C $main -c core.quotePath=false status --porcelain 2>$null)

# Deleted entries: " D" (worktree), "D " (staged), "DD" (both)
$deletedLines = @($status | Where-Object { $_ -match '^( ?D|D )' })
if ($deletedLines.Count -eq 0) {
    Write-Host "No deleted files (D). Nothing to restore."
    exit 0
}

$entries = @()
foreach ($line in $deletedLines) {
    if ($line.Length -lt 4) { continue }
    $xy   = $line.Substring(0, 2)
    $path = $line.Substring(3)
    # Index holds content HEAD does not -> restoring discards a staged modification.
    $risky = ($xy[1] -eq 'D') -and ($xy[0] -ne ' ') -and ($xy[0] -ne 'D')
    $entries += [pscustomobject]@{ Path = $path; XY = $xy; Risky = $risky }
}

Write-Host "=== Deleted files to restore: $($entries.Count) ==="
foreach ($e in $entries) {
    $tag = if ($e.Risky) { ' [staged content differs from HEAD; needs -Force]' } else { '' }
    Write-Host ("  [{0}] {1}{2}" -f $e.XY, $e.Path, $tag)
}

$toRestore = @($entries | Where-Object { -not $_.Risky })
$skipped   = @($entries | Where-Object { $_.Risky })
if ($skipped.Count -gt 0 -and -not $Force) {
    Write-Host ""
    Write-Host "  $($skipped.Count) path(s) skipped (index differs from HEAD). Inspect with:"
    foreach ($e in $skipped) { Write-Host ("    git diff HEAD -- {0}" -f $e.Path) }
    Write-Host "  Re-run with -Force to restore them anyway (discards the staged modification)."
}
if ($Force) { $toRestore = @($entries) }

if ($WhatIf) {
    Write-Host ""
    Write-Host "=== WHATIF (nothing has been changed) ==="
    foreach ($e in $toRestore) { Write-Host ("  git -C `"$main`" checkout HEAD -- `"{0}`"" -f $e.Path) }
    exit 0
}

# ---------------- back up non-deleted modifications in the same directories ----------------
Write-Host ""
Write-Host "=== Backing up uncommitted, non-deleted modifications ==="
$backupDir = Join-Path $env:TEMP ("wt-restore-backup-" + [guid]::NewGuid().ToString('N'))
$changed = @($status | Where-Object { $_ -notmatch '^( ?D|D )' -and $_ -notmatch '^\?\?' } |
             ForEach-Object { $_.Substring(3) })
$backed = 0
if ($changed.Count -gt 0) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    foreach ($rel in $changed) {
        $src = Join-Path $main $rel
        if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { continue }
        $dst = Join-Path $backupDir ($rel -replace '[/\\]', '__')
        try { Copy-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop; $backed++ } catch { }
    }
}
Write-Host "  backed up $backed file(s) -> $backupDir"

# ---------------- restore, one path at a time ----------------
Write-Host ""
Write-Host "=== Restoring (from HEAD, per path) ==="
$ok = 0; $fail = @()
foreach ($e in $toRestore) {
    $err = & git -C $main checkout HEAD -- $e.Path 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ok++
        Write-Host "  restored : $($e.Path)"
    } else {
        $fail += $e.Path
        Write-Host ("  FAILED   : {0}  ({1})" -f $e.Path, ($err -join ' '))
    }
}

# ---------------- verify ----------------
Write-Host ""
Write-Host "=== Verify ==="
$after = @(git -C $main -c core.quotePath=false status --porcelain 2>$null)
$remaining = @($after | Where-Object { $_ -match '^( ?D|D )' } | ForEach-Object { $_.Substring(3) })

Write-Host "  restored : $ok"
Write-Host "  failed   : $($fail.Count)"
if ($remaining.Count -gt 0) {
    Write-Host "  still deleted: $($remaining.Count)"
    $remaining | Select-Object -First 20 | ForEach-Object { Write-Host "    $_" }
} else {
    Write-Host "  still deleted: 0"
}
if ($fail.Count -eq 0 -and $remaining.Count -eq 0) {
    Write-Host "  PASS: all deletions restored."
    if ($backed -gt 0) { Write-Host "  Backup kept at $backupDir (delete once confirmed)." }
    Write-Host "DONE"
    exit 0
}
Write-Host "  INCOMPLETE: see failures above."
if ($backed -gt 0) { Write-Host "  Backup kept at $backupDir" }
exit 1
