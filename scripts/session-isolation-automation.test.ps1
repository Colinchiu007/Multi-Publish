$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$health = Join-Path $root 'scripts/mp-worktree-health.ps1'
$launcher = Join-Path $root 'scripts/start-mp-task.ps1'
$installer = Join-Path $root 'scripts/install-session-isolation-task.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('mp-isolation-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$passed = 0
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw "FAIL: $message" }; $script:passed++; Write-Host "PASS: $message" }
function RunInstaller([string[]]$argsList) {
    # 2>&1 under ErrorActionPreference=Stop promotes the child process NORMAL stderr to a
    # terminating NativeCommandError under Windows PowerShell 5.1 (same measured failure and
    # same fix as install-session-isolation-task.test.ps1): widen only for the capture,
    # restore in finally, and judge by rc plus an explicit artifact check.
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer @argsList 2>&1
        return @{ rc = $LASTEXITCODE; text = ($out -join "`n") }
    } finally {
        $ErrorActionPreference = $saved
    }
}
$scratch = $null
try {
    Assert (Test-Path $health) 'health script exists'
    Assert (Test-Path $launcher) 'launcher exists'
    Assert (Test-Path $installer) 'scheduled-task installer exists'
    $report = Join-Path $tmp 'health.json'
    $primary = (& git -C $root worktree list --porcelain | Where-Object { $_ -like 'worktree *' } | Select-Object -First 1).Substring(9)
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $health -Root $primary -ReportPath $report -RequireClean -RequireHooks -RequirePrimary -Quiet
    Assert ($LASTEXITCODE -eq 0) 'current primary worktree passes health check'
    Assert (Test-Path $report) 'health report is emitted outside the repository'
    $json = Get-Content $report -Raw | ConvertFrom-Json
    Assert ($json.branch -eq 'main') 'health report records main'
    Assert ($json.primary -eq $true) 'health report identifies primary worktree'
    Assert ($json.ok -eq $true) 'health report records ok=true'
    $worktreeRoot = Join-Path (Split-Path -Parent $primary) 'mp-worktrees'
    $report2 = Join-Path $tmp 'health-worktree-root.json'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $health -Root $primary -ReportPath $report2 -WorktreeRoot $worktreeRoot -RequireClean -RequireHooks -RequirePrimary -Quiet
    Assert ($LASTEXITCODE -eq 0) 'health check accepts explicit -WorktreeRoot'
    Assert (Test-Path $report2) 'explicit worktree-root report is emitted'
    $json2 = Get-Content $report2 -Raw | ConvertFrom-Json
    Assert ($json2.worktreeRoot -eq $worktreeRoot) 'health report records resolved worktree root'

    # Task registration contract - exercised on a THROWAWAY -TaskPath only. The production
    # path (\Mulpub\) must never be touched by a self-check: an unregister/re-register
    # cycle there can silently dismantle the live write guard when the re-registration
    # needs elevation (AGENTS.md 2026-09-28 constraint).
    $scratch = '\mp-isolation-selfcheck-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '\'
    $reg = RunInstaller @('-TaskPath', $scratch)
    $task = Get-ScheduledTask -TaskPath $scratch -TaskName 'Session Isolation Health' -ErrorAction SilentlyContinue
    Assert ($null -ne $task) 'health task registers under the throwaway task path'
    $arguments = $task.Actions[0].Arguments.Replace('\','/')
    $primaryKey = $primary.Replace('\','/').TrimEnd('/')
    Assert ($arguments -like "*$primaryKey/scripts/mp-worktree-health.ps1*") 'scheduled task points to stable primary-root health script'
    Assert ($arguments -like "*-Root $([char]34)$primaryKey$([char]34)*") 'scheduled task checks the stable primary root'
    # Principal contract. Preferred logon type is S4U because that is what actually removes the
    # console window (measured 2026-10-03, Win11 + Windows Terminal as default console host:
    # Settings.Hidden=True still produced a visible window ~300ms after a manual trigger, while
    # S4U produced none and the task still ran). S4U can be refused on some hosts; the installer
    # then falls back to Interactive and must warn - so an Interactive principal is only
    # acceptable together with that WARN, which is what this branch pins.
    $fellBack = $reg.text -match 'registered with an interactive principal'
    if ($fellBack) {
        Assert ($task.Principal.LogonType -eq 'Interactive') 'fallback principal is Interactive after a refused S4U registration'
    } else {
        Assert ($task.Principal.LogonType -eq 'S4U') "health task must register non-interactive (got $($task.Principal.LogonType))"
    }
    $guardTask = Get-ScheduledTask -TaskPath $scratch -TaskName 'Session Isolation Write Guard' -ErrorAction SilentlyContinue
    if ($guardTask) {
        # Elevated host: both tasks register and the installer must exit 0.
        Assert ($reg.rc -eq 0) 'installer exits 0 when both tasks registered (elevated host)'
        $guardArguments = $guardTask.Actions[0].Arguments.Replace('\','/')
        Assert ($guardArguments -like "*$primaryKey/scripts/guard-shared-root-writes.ps1*") 'write guard task points to stable primary-root guard script'
        Assert ($guardTask.Principal.LogonType -eq $task.Principal.LogonType) 'both tasks share one principal policy'
    } else {
        # Non-elevated host: the OS refuses the AtLogOn trigger (measured PermissionDenied /
        # 0x80070005) and the installer must fail closed with the elevation guidance
        # instead of reporting success.
        Assert ($reg.rc -ne 0) 'installer fails closed when the AtLogOn registration is refused'
        Assert ($reg.text -match 'RunAs') 'failure output names the elevated re-run path'
    }
    $removed = RunInstaller @('-Unregister', '-TaskPath', $scratch)
    Assert ($removed.rc -eq 0) 'unregister on the throwaway path succeeds'
    Assert ($null -eq (Get-ScheduledTask -TaskPath $scratch -TaskName 'Session Isolation Health' -ErrorAction SilentlyContinue)) 'throwaway tasks are removed'
    Write-Host "PASS: $passed session isolation automation checks" -ForegroundColor Green
} finally {
    if ($scratch) {
        Get-ScheduledTask -TaskPath $scratch -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
