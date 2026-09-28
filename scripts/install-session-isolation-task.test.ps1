# Regression tests for scripts/install-session-isolation-task.ps1
#
# Scope: the deterministic part only - the guard that keeps a caller from wiping the LIVE
# \Multi-Publish\ tasks, the -TaskPath escape hatch, and the parameter surface.
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

$livePath = '\Multi-Publish\'
$liveBefore = @(Get-ScheduledTask -TaskPath $livePath -ErrorAction SilentlyContinue | ForEach-Object { $_.TaskName })

try {
    # 1) -Unregister aimed at the production path must be refused without the explicit switch
    $refused = RunInstaller @('-Unregister')
    Check ($refused.rc -ne 0) 'unregister against the live path exits non-zero' "rc=$($refused.rc)"
    Check ($refused.text -match 'AllowLiveUnregister') 'refusal names the escape hatch' $refused.text.Substring(0, [Math]::Min(200, $refused.text.Length))

    # 2) The refusal must not have deleted anything - judged by the artifact, not by rc.
    #    The comparison needs its own parentheses: without them PowerShell binds the bare
    #    value as $cond and passes -eq/0 along as the following arguments (measured: a
    #    passing comparison still reported FAIL, and 0 live tasks would red out on CI).
    $liveAfter = @(Get-ScheduledTask -TaskPath $livePath -ErrorAction SilentlyContinue | ForEach-Object { $_.TaskName })
    $untouched = (@(Compare-Object ($liveBefore | Sort-Object) ($liveAfter | Sort-Object) -SyncWindow 0).Count -eq 0)
    Check $untouched 'live tasks untouched by the refused call' "before=$($liveBefore -join ',') after=$($liveAfter -join ',')"

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
    $noSlash = RunInstaller @('-Unregister', '-TaskPath', '\Multi-Publish')
    Check ($noSlash.rc -ne 0) 'live path is refused without a trailing backslash too' "rc=$($noSlash.rc)"

    Write-Host "PASS: $passed install-session-isolation-task checks" -ForegroundColor Green
} finally {
    $liveEnd = @(Get-ScheduledTask -TaskPath $livePath -ErrorAction SilentlyContinue | ForEach-Object { $_.TaskName })
    if ((Compare-Object ($liveBefore | Sort-Object) ($liveEnd | Sort-Object) -SyncWindow 0 | Measure-Object).Count -ne 0) {
        Write-Host "LIVE TASKS CHANGED during the test run: before=$($liveBefore -join ',') end=$($liveEnd -join ',')" -ForegroundColor Red
    }
}
