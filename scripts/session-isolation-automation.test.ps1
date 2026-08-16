$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$health = Join-Path $root 'scripts/mp-worktree-health.ps1'
$launcher = Join-Path $root 'scripts/start-mp-task.ps1'
$installer = Join-Path $root 'scripts/install-session-isolation-task.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('mp-isolation-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$passed = 0
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw "FAIL: $message" }; $script:passed++; Write-Host "PASS: $message" }
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
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
    Assert ($LASTEXITCODE -eq 0) 'scheduled task registers successfully'
    $task = Get-ScheduledTask -TaskPath '\Multi-Publish\' -TaskName 'Session Isolation Health'
    $arguments = $task.Actions[0].Arguments.Replace('\','/')
    $primaryKey = $primary.Replace('\','/').TrimEnd('/')
    Assert ($arguments -like "*$primaryKey/scripts/mp-worktree-health.ps1*") 'scheduled task points to stable primary-root health script'
    Assert ($arguments -like "*-Root $([char]34)$primaryKey$([char]34)*") 'scheduled task checks the stable primary root'
    $guardTask = Get-ScheduledTask -TaskPath '\Multi-Publish\' -TaskName 'Session Isolation Write Guard'
    Assert ($null -ne $guardTask) 'write guard task registers successfully'
    $guardArguments = $guardTask.Actions[0].Arguments.Replace('\','/')
    Assert ($guardArguments -like "*$primaryKey/scripts/guard-shared-root-writes.ps1*") 'write guard task points to stable primary-root guard script'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Unregister
    Assert ($LASTEXITCODE -eq 0) 'scheduled-task removal is idempotent'
    Assert ($null -eq (Get-ScheduledTask -TaskPath '\Multi-Publish\' -TaskName 'Session Isolation Write Guard' -ErrorAction SilentlyContinue)) 'write guard task is removed with installer'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
    Assert ($LASTEXITCODE -eq 0) 'scheduled task is restored after self-check'
    Assert ($null -ne (Get-ScheduledTask -TaskPath '\Multi-Publish\' -TaskName 'Session Isolation Write Guard' -ErrorAction SilentlyContinue)) 'write guard task is restored after self-check'
    Write-Host "PASS: $passed session isolation automation checks" -ForegroundColor Green
} finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
