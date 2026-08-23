<# Registers or removes the per-user Windows session-isolation tasks (health + write guard). #>
[CmdletBinding()]
param([switch]$Unregister, [ValidateRange(1,60)][int]$Minutes = 15, [string]$GitPath = '')
$ErrorActionPreference = 'Stop'
$taskPath = '\Multi-Publish\'
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
$report = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Multi-Publish\session-isolation\health.json'
if ($Unregister) {
    Get-ScheduledTask -TaskPath $taskPath -ErrorAction SilentlyContinue |
        ForEach-Object { Unregister-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -Confirm:$false }
    Write-Host "Removed scheduled tasks: $taskName, $guardTaskName"
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
Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -InputObject $task -Force | Out-Null

$guardArgument = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $q$guardScript$q -Watch -Root $q$primary$q -GitPath $q$git$q -Quiet"
$guardAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $guardArgument
$guardTrigger = New-ScheduledTaskTrigger -AtLogOn
$guardSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Days 3650)
$guardTask = New-ScheduledTask -Action $guardAction -Trigger $guardTrigger -Settings $guardSettings -Principal $principal -Description 'Multi-Publish shared root real-time write guard'
Register-ScheduledTask -TaskName $guardTaskName -TaskPath $taskPath -InputObject $guardTask -Force | Out-Null

Write-Host "Registered scheduled tasks: $taskName (every $Minutes minutes), $guardTaskName (at logon)" -ForegroundColor Green
Write-Host "Report: $report"
