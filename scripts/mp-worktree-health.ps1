<#
.SYNOPSIS
    检查 Multi-Publish 共享主目录是否满足隔离合同。
.DESCRIPTION
    只读检查：主 worktree 必须是 main、干净、无事故 marker，hooks 必须与
    权威源一致，所有 linked worktree 必须位于 D 盘隔离目录；
    可选的 -RequireWriteGuard 同时校验实时写保护任务已注册且正在运行。
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$ReportPath = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Multi-Publish\session-isolation\health.json'),
    [switch]$RequireClean,
    [switch]$RequireHooks,
    [switch]$RequirePrimary,
    [switch]$RequireWriteGuard,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\','/')
$git = 'D:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path -LiteralPath $git)) { $git = 'git' }
function Git([string[]]$gitArgs) { & $git -C $root @gitArgs }

$branch = (Git @('branch','--show-current')).Trim()
$status = @(Git @('status','--porcelain=v1'))
$marker = Join-Path $root '.agent_context/shared-root-violation'
$common = (Git @('rev-parse','--path-format=absolute','--git-common-dir')).Trim().TrimEnd('\','/')
$primaryGit = (Git @('rev-parse','--path-format=absolute','--git-dir')).Trim().TrimEnd('\','/')
$isPrimary = $common -eq $primaryGit
if (-not $common -or -not $primaryGit) { throw '无法解析 Git common-dir 或 worktree git-dir' }

$hookResults = @()
foreach ($name in @('pre-commit','post-checkout')) {
    $source = Join-Path $root "scripts/hooks/$name"
    $installed = Join-Path $common "hooks/$name"
    $sourceHash = if (Test-Path $source) { (Get-FileHash $source -Algorithm SHA256).Hash } else { $null }
    $installedHash = if (Test-Path $installed) { (Get-FileHash $installed -Algorithm SHA256).Hash } else { $null }
    $hookResults += [ordered]@{ name=$name; sourceExists=[bool]$sourceHash; installedExists=[bool]$installedHash; match=($sourceHash -and $sourceHash -eq $installedHash) }
}

$guardTask = Get-ScheduledTask -TaskPath '\Multi-Publish\' -TaskName 'Session Isolation Write Guard' -ErrorAction SilentlyContinue
$guardRunning = $false
if ($guardTask) {
    $guardProcs = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*guard-shared-root-writes.ps1*' })
    $guardRunning = $guardProcs.Count -gt 0
}
$quarantineRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Multi-Publish\session-isolation\quarantine'
$guardFiles = @()
$violationCount = 0
if (Test-Path -LiteralPath $quarantineRoot) {
    $guardFiles = @(Get-ChildItem -LiteralPath $quarantineRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'violations.jsonl' })
    $violationLog = Join-Path $quarantineRoot 'violations.jsonl'
    if (Test-Path -LiteralPath $violationLog) { $violationCount = @(Get-Content -LiteralPath $violationLog -ErrorAction SilentlyContinue | Where-Object { $_.Trim() }).Count }
}

$worktreeLines = @(Git @('worktree','list','--porcelain'))
$paths = @($worktreeLines | Where-Object { $_ -like 'worktree *' } | ForEach-Object { $_.Substring(9) })
$rootKey = $root.Replace('\','/').TrimEnd('/')
$outside = @($paths | Where-Object { $pathKey = $_.Replace('\','/').TrimEnd('/'); $pathKey -ne $rootKey -and $pathKey -notlike 'D:/Data/projects/mp-worktrees/mp-*' })
$hooksBad = @($hookResults | Where-Object { -not $_.match }).Count -gt 0
$rootAllowed = if ($RequirePrimary) { $isPrimary -and $branch -eq 'main' } else { $isPrimary -or $root -like 'D:\Data\projects\mp-worktrees\mp-*' -or $root -like 'D:/Data/projects/mp-worktrees/mp-*' }
$writeGuardOk = [bool]$guardTask -and $guardRunning
$ok = $rootAllowed -and -not (Test-Path $marker) -and (($RequireClean -eq $false) -or $status.Count -eq 0) -and (($RequireHooks -eq $false) -or -not $hooksBad) -and $outside.Count -eq 0 -and (($RequireWriteGuard -eq $false) -or $writeGuardOk)

$writeGuard = [ordered]@{ taskRegistered=[bool]$guardTask; running=$guardRunning; quarantineCount=$guardFiles.Count; violations=$violationCount; ok=$writeGuardOk }
$report = [ordered]@{ checkedAt=(Get-Date).ToUniversalTime().ToString('o'); root=$root; primary=$isPrimary; branch=$branch; clean=($status.Count -eq 0); marker=(Test-Path $marker); hooks=$hookResults; writeGuard=$writeGuard; worktreeCount=$paths.Count; outsideWorktrees=$outside; ok=$ok }
$parent = Split-Path -Parent $ReportPath
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
if (-not $Quiet) { $report | ConvertTo-Json -Depth 6 | Write-Output }
if (-not $ok) { exit 1 }
