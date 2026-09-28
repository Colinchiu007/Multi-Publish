<# Registers or removes the per-user Windows session-isolation tasks (health + write guard). #>
[CmdletBinding()]
param(
    [switch]$Unregister,
    [ValidateRange(1,60)][int]$Minutes = 15,
    [string]$GitPath = '',
    # Task folder. Defaults to the production path; tests and troubleshooting should pass
    # a throwaway path so that neither registration nor -Unregister can touch the tasks
    # other sessions are actually relying on.
    [string]$TaskPath = '\Mulpub\',
    # -Unregister aimed at the production path requires this switch. Without it, an
    # "unregister, re-register, and the re-registration fails for lack of elevation"
    # sequence would silently remove the shared-root write guard.
    [switch]$AllowLiveUnregister
)
$ErrorActionPreference = 'Stop'

# Task Scheduler expects a trailing backslash. Without it Get-ScheduledTask -TaskPath
# returns an empty set, so -Unregister would report "removed 0 task(s)" as a success
# while having removed nothing.
if (-not $TaskPath.EndsWith('\')) { $TaskPath += '\' }
$taskName = 'Session Isolation Health'
$guardTaskName = 'Session Isolation Write Guard'
$scriptRepo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$git = $GitPath
if (-not $git -and $env:MP_GIT) { $git = $env:MP_GIT }
if (-not $git) {
    $gitCmd = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($gitCmd -and $gitCmd.Source) { $git = $gitCmd.Source }
}
if (-not $git -or -not (Test-Path -LiteralPath $git)) {
    foreach ($candidate in @('C:\Program Files\Git\cmd\git.exe','C:\Program Files (x86)\Git\cmd\git.exe','D:\Program Files\Git\cmd\git.exe')) {
        if (Test-Path -LiteralPath $candidate) { $git = $candidate; break }
    }
}
if (-not $git -or -not (Test-Path -LiteralPath $git)) {
    throw '找不到 git.exe；请安装 Git for Windows，或通过 -GitPath / MP_GIT 指定'
}

$repo = (& $git -C $scriptRepo worktree list --porcelain | Where-Object { $_ -like 'worktree *' } | Select-Object -First 1).Substring(9)
$health = Join-Path $repo 'scripts/mp-worktree-health.ps1'
$guardScript = Join-Path $repo 'scripts/guard-shared-root-writes.ps1'
$report = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Mulpub\session-isolation\health.json'
if ($Unregister) {
    if ($TaskPath -eq '\Mulpub\' -and -not $AllowLiveUnregister) {
        Write-Error ("Refusing to unregister tasks under the production path $TaskPath - these are " +
            "the live shared-root write guard and health check other sessions depend on. If they are " +
            "removed and the re-registration then fails (an AtLogOn trigger needs elevation; measured " +
            "non-elevated: HRESULT 0x80070005), write protection stops silently. " +
            "Pass -AllowLiveUnregister if this is really intended, or point tests and self-checks " +
            "at a throwaway -TaskPath.")
    }
    $existing = @(Get-ScheduledTask -TaskPath $TaskPath -ErrorAction SilentlyContinue)
    foreach ($t in $existing) {
        Unregister-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -Confirm:$false
    }
    # Judge by the artifact, never by rc: a non-terminating cmdlet error does not set
    # $LASTEXITCODE, so rc alone would report "deleted nothing" as success - measured on
    # the registration side of this very script.
    $left = @(Get-ScheduledTask -TaskPath $TaskPath -ErrorAction SilentlyContinue)
    if ($left.Count -gt 0) {
        Write-Error ("Tasks still exist after un-registering: " + (($left | ForEach-Object { $_.TaskName }) -join ", "))
        exit 1
    }
    Write-Host "Removed scheduled tasks under $TaskPath ($($existing.Count) task(s)): $taskName, $guardTaskName"
    exit 0
}
$q = [char]34
$primary = (& $git -C $repo worktree list --porcelain | Where-Object { $_ -like 'worktree *' } | Select-Object -First 1).Substring(9)
$argument = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $q$health$q -Root $q$primary$q -GitPath $q$git$q -ReportPath $q$report$q -RequireClean -RequireHooks -RequirePrimary -RequireWriteGuard -Quiet"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Multi-Publish session isolation health check'
function Register-Checked {
    param([string]$Name, [string]$Path, $InputObject, [string]$TriggerKind)
    try {
        Register-ScheduledTask -TaskName $Name -TaskPath $Path -InputObject $InputObject -Force | Out-Null
    } catch {
        Write-Host "Register failed for $Name ($TriggerKind): $($_.Exception.Message)" -ForegroundColor Yellow
    }
    # Same rule here: registration is judged by whether the task actually exists, not by
    # rc, because the cmdlet's non-terminating error leaves $LASTEXITCODE untouched (0).
    $got = Get-ScheduledTask -TaskName $Name -TaskPath $Path -ErrorAction SilentlyContinue
    if (-not $got) {
                Write-Error ("Task was not registered: $Name ($TriggerKind, path $Path). " +
                    "An AtLogOn trigger must be registered elevated, e.g. " +
                    "Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File <this script>'; " +
                    "tests and self-checks should use a throwaway -TaskPath instead.")
    }
    Write-Host "Registered: $Name ($TriggerKind) under $Path"
}

Register-Checked -Name $taskName -Path $TaskPath -InputObject $task -TriggerKind "every $Minutes minutes"

$guardArgument = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $q$guardScript$q -Watch -Root $q$primary$q -GitPath $q$git$q -Quiet"
$guardAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $guardArgument
$guardTrigger = New-ScheduledTaskTrigger -AtLogOn
$guardSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Days 3650)
$guardTask = New-ScheduledTask -Action $guardAction -Trigger $guardTrigger -Settings $guardSettings -Principal $principal -Description 'Multi-Publish shared root real-time write guard'
Register-Checked -Name $guardTaskName -Path $TaskPath -InputObject $guardTask -TriggerKind 'at logon'

Write-Host "Scheduled tasks ready under $TaskPath : $taskName (every $Minutes minutes), $guardTaskName (at logon)" -ForegroundColor Green
Write-Host "Report: $report"
