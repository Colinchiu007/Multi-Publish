# Regression tests for scripts/install-session-isolation-task.ps1
#
# Scope: the deterministic part only - the guard that keeps a caller from wiping the LIVE
# \Mulpub\ tasks, the -TaskPath escape hatch, and the parameter surface.
# Deliberately NO task registration happens here: registering the write-guard task needs an
# AtLogOn trigger, which fails for a non-elevated process (measured: PermissionDenied /
# HRESULT 0x80070005), so anything that registers would be environment-dependent and could not
# be wired into CI. Registration itself is covered by session-isolation-automation.test.ps1.
#
# Comments stay ASCII: this file is BOM-less UTF-8 and Windows PowerShell 5.1 decodes such
# files as ANSI, which breaks parsing on non-ASCII bytes (measured elsewhere in this repo).
#
#   pwsh       -NoProfile -ExecutionPolicy Bypass -File scripts/install-session-isolation-task.test.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-session-isolation-task.test.ps1

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$installer = Join-Path $here 'install-session-isolation-task.ps1'
if (-not (Test-Path -LiteralPath $installer)) { throw "installer missing: $installer" }

$passed = 0
function Check([bool]$cond, [string]$name, [string]$detail) {
    if ($cond) { Write-Host "PASS $name"; $script:passed++ }
    else { Write-Host "FAIL $name  $detail"; throw "FAIL: $name" }
}

function RunInstaller([string[]]$argsList) {
    # 2>&1 inside ErrorActionPreference=Stop promotes the child process NORMAL stderr to a
    # terminating NativeCommandError under Windows PowerShell 5.1 (documented in AGENTS.md
    # and re-measured here: the refusal message itself aborted the caller). Widen only for
    # the capture, restore in finally, and judge by rc plus an explicit artifact check.
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer @argsList 2>&1
        return @{ rc = $LASTEXITCODE; text = ($out -join "`n") }
    } finally {
        $ErrorActionPreference = $saved
    }
}

$livePath = '\Mulpub\'

# Snapshot the live task path into SCRIPT-SCOPE variables instead of returning a value.
# Root cause of the CI red (run 36388005361 / step Gate 2d): a function whose last statement
# is `@(...)` hands its CALLER a $null, because the automatic output pipeline unrolls an empty
# array. Measured on 5.1: `function F1 { @() }` -> `(F1)` is NULL, while `, @()` in the body and
# `@(F1)` at the call site both give Object[] of length 0. A call-site wrap would have fixed
# this run, but it leaves the burden on every future caller; taking no return value removes it.
# On a CI runner \Mulpub\ simply does not exist, so the snapshot is empty and
# Compare-Object then refused to bind null to -ReferenceObject.
# A joined signature string cannot be null and cannot flatten, so the set compare needs no
# array at all.
function Set-LiveSnapshot {
    $names = @(Get-ScheduledTask -TaskPath $livePath -ErrorAction SilentlyContinue |
        ForEach-Object { $_.TaskName } | Sort-Object)
    $script:liveSig = ($names -join '|')
    $script:liveCount = $names.Count
}

Set-LiveSnapshot
$liveBeforeSig = $script:liveSig
$liveBeforeCount = $script:liveCount
Write-Host "LIVE_TASK_COUNT=$liveBeforeCount names=[$($liveBeforeSig -replace '\|', ',')]"

try {
    # 1) -Unregister aimed at the production path must be refused without the explicit switch
    $refused = RunInstaller @('-Unregister')
    Check ($refused.rc -ne 0) 'unregister against the live path exits non-zero' "rc=$($refused.rc)"
    Check ($refused.text -match 'AllowLiveUnregister') 'refusal names the escape hatch' $refused.text.Substring(0, [Math]::Min(200, $refused.text.Length))

    # 2) The refusal must not have deleted anything - judged by the artifact, not by rc.
    Set-LiveSnapshot
    Check ($script:liveSig -ceq $liveBeforeSig) 'live tasks untouched by the refused call' "before=[$liveBeforeSig] after=[$($script:liveSig)]"

    # 3) A throwaway path is allowed through (no production task can be reached by accident).
    $scratch = '\MulpubNonexistent-UnitProbe-XYZ\'
    $allowed = RunInstaller @('-Unregister', '-TaskPath', $scratch)
    Check ($allowed.rc -eq 0) 'unregister on a throwaway path is allowed' "rc=$($allowed.rc) :: $($allowed.text.Substring(0, [Math]::Min(160, $allowed.text.Length)))"

    # 4) Parameter surface, read from the running script (not grepped from text)
    $params = (Get-Command $installer).Parameters.Keys
    Check ($params -contains 'TaskPath') 'installer exposes -TaskPath' ($params -join ',')
    Check ($params -contains 'AllowLiveUnregister') 'installer exposes -AllowLiveUnregister' ($params -join ',')

    # 5) The live path is refused even when written without the trailing backslash,
    #    otherwise normalisation would hand the guard a bypass.
    $noSlash = RunInstaller @('-Unregister', '-TaskPath', '\Mulpub')
    Check ($noSlash.rc -ne 0) 'live path is refused without a trailing backslash too' "rc=$($noSlash.rc)"

    Write-Host "PASS: $passed install-session-isolation-task checks" -ForegroundColor Green
} finally {
    Set-LiveSnapshot
    if ($script:liveSig -cne $liveBeforeSig) {
        $msg = "LIVE TASKS CHANGED during the test run: before=[$liveBeforeSig] end=[$($script:liveSig)]"
        Write-Host $msg -ForegroundColor Red
        throw $msg
    }
    # Be honest about coverage instead of letting it read as a strong pass: on a CI runner
    # \Mulpub\ does not exist at all, so "nothing was deleted" can only be proven on a
    # developer machine. The signature compare still proves the refused call created nothing.
    if ($liveBeforeCount -eq 0) {
        Write-Host 'NOTE: no live \Mulpub\ task on this host - the deletion guard was exercised only as "no task created either"; the destructive case needs a dev machine'
    } else {
        Write-Host "PROVED: $liveBeforeCount live \Mulpub\ task(s) survived the refused -Unregister"
    }
}
