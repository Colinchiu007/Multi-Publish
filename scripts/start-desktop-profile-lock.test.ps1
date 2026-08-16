#requires -Version 7
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'desktop-profile-lock.ps1')

$profile = 'D:\tmp\Multi-Publish-debug-profile'
$repo    = 'D:\Data\projects\mp-worktrees\mp-desktop-dev'

# ---- 1) 正则边界：带引号 / 不带引号 / 相似路径不误配 ----
$rx = '--user-data-dir=("?' + [regex]::Escape($profile) + '"?)(?=\s|$)'
$cases = @(
  @{ ok = $true;  line = '--user-data-dir=D:\tmp\Multi-Publish-debug-profile --x' },
  @{ ok = $true;  line = '--user-data-dir="D:\tmp\Multi-Publish-debug-profile" --x' },
  @{ ok = $false; line = '--user-data-dir=D:\tmp\Multi-Publish-debug-profile-old --x' },
  @{ ok = $false; line = '--user-data-dir=D:\tmp\Multi-Publish-debug-profi --x' },
  @{ ok = $false; line = '--user-data-dir=D:\other --x' }
)
foreach ($c in $cases) {
  $m = $c.line -match $rx
  if ($m -ne $c.ok) { throw "REGEX 边界失败: '$($c.line)' expect=$($c.ok) got=$m" }
}
Write-Host 'PASS 正则边界'

# ---- 2) 分类注入：same / foreign 主进程+子进程 ----
$owners = @(
  [pscustomobject]@{ Pid = 101; ExePath = "$repo\node_modules\electron\dist\electron.exe"; IsMain = $true;  CommandLine = '' },
  [pscustomobject]@{ Pid = 202; ExePath = 'D:\Data\projects\mp-worktrees\mp-other\node_modules\electron\dist\electron.exe'; IsMain = $true;  CommandLine = '' },
  [pscustomobject]@{ Pid = 203; ExePath = 'D:\Data\projects\mp-worktrees\mp-other\node_modules\electron\dist\electron.exe'; IsMain = $false; CommandLine = '' }
)
$r = Get-ProfileLockReport -ProfilePath $profile -RepoRoot $repo -Owners $owners
if ($r.Same.Count -ne 1)        { throw "Same.Count=$($r.Same.Count) 期望 1" }
if ($r.Foreign.Count -ne 2)     { throw "Foreign.Count=$($r.Foreign.Count) 期望 2" }
if ($r.ForeignMain.Count -ne 1) { throw "ForeignMain.Count=$($r.ForeignMain.Count) 期望 1" }
if (-not $r.HasForeign)         { throw 'HasForeign 应 True' }
Write-Host 'PASS 分类注入'

# ---- 3) 在线冒烟：当前运行实例属于本 worktree 时不应判 foreign ----
$live = Get-ProfileLockReport -ProfilePath $profile -RepoRoot $repo
Write-Host "在线 owners=$($live.Owners.Count) same=$($live.Same.Count) foreign=$($live.Foreign.Count)"
if ($live.Owners.Count -gt 0 -and $live.HasForeign) {
  throw "在线扫描发现 foreign 占用（$($live.Foreign.ExePath -join ', ')）"
}
Write-Host 'PASS 在线冒烟'

Write-Host 'PROFILE_LOCK_TEST_OK'
