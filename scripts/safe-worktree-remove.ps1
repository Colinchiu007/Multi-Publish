<#
.SYNOPSIS
安全删除 git worktree（AGENTS.md 防护铁律 R1-R5 落地）。

.DESCRIPTION
防止删除 worktree 时级联删除主工作区共享文件（junction/硬链接）或污染主工作区。
流程：基线快照 → junction 检测 → 停占用进程 → git worktree remove → 主工作区验证。

.PARAMETER Worktree
目标 worktree 绝对路径（必须显式给出，不接受模糊路径）。

.PARAMETER Force
允许 git worktree remove --force（默认要求先确认 dirty 清单无价值）。

.PARAMETER MainWorkspace
主工作区路径（默认当前仓库根）。
#>
param(
  [Parameter(Mandatory = $true)][string]$Worktree,
  [switch]$Force,
  [string]$MainWorkspace = (git rev-parse --show-toplevel 2>$null)
)

$ErrorActionPreference = 'Stop'
if (-not $MainWorkspace) { Write-Host "无法定位主工作区，请用 -MainWorkspace 指定。"; exit 1 }

$wt = [System.IO.Path]::GetFullPath($Worktree)
$main = [System.IO.Path]::GetFullPath($MainWorkspace)
if ($wt -eq $main) { Write-Host "⛔ 目标不能是主工作区本身。"; exit 1 }
if (-not (Test-Path -LiteralPath $wt)) { Write-Host "SKIP: worktree 不存在 $wt"; exit 0 }

Write-Host "=== [R1] 主工作区基线快照 ==="
$baseline = @(git -C $main status --porcelain 2>$null)
$baselineStash = (git -C $main stash list 2>$null | Measure-Object).Count
$baselineFile = Join-Path $env:TEMP ("mp-wt-baseline-" + [guid]::NewGuid().ToString('N') + ".txt")
$baseline | Set-Content -LiteralPath $baselineFile -Encoding utf8
Write-Host "  未提交条目: $($baseline.Count), stash: $baselineStash"

Write-Host "=== [R3] junction/reparse point 扫描 ==="
$links = Get-ChildItem -LiteralPath $wt -Force -Recurse -Depth 3 -ErrorAction SilentlyContinue |
  Where-Object { $_.LinkType -or ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) }
$toMain = @()
foreach ($l in $links) {
  $t = ($l.Target -join '')
  if ($t -and ($t -like "$main*")) { $toMain += $l }
}
if ($toMain.Count) {
  Write-Host "  ⚠️ 发现指向主工作区的共享链接："
  $toMain | ForEach-Object { Write-Host "    $($_.FullName) -> $($_.Target)" }
  Write-Host "  ⛔ 中止：先解除这些 junction/symlink，避免级联删除主工作区文件。"
  exit 2
} else {
  Write-Host "  未发现指向主工作区的共享链接（worktree 内部链接 $($links.Count) 个，删除安全）"
}

Write-Host "=== [R4] 停占用进程（按路径过滤） ==="
$procs = Get-Process node, electron, esbuild -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like "$wt*" }
foreach ($p in $procs) { Stop-Process -Id $p.Id -Force; Write-Host "  STOPPED $($p.ProcessName) #$($p.Id)" }

Write-Host "=== [R5] git worktree remove ==="
$args = @('-C', $main, 'worktree', 'remove')
if ($Force) { $args += '--force' }
$args += $wt
& git @args 2>&1 | Out-String | Write-Host
$rc = $LASTEXITCODE
if ($rc -ne 0) {
  if (-not $Force) {
    Write-Host "  普通删除失败（可能有 dirty/残留）。确认 dirty 清单无价值后重跑 -Force；残留目录须用受控方式清理（勿宽路径删除）。"
    exit 1
  }
  Write-Host "  git 注册已移除，残留目录请用 safe-restore/受控删除处理。"
}
& git -C $main worktree prune 2>&1 | Out-Null

Write-Host "=== 验证：主工作区与基线一致 ==="
$after = @(git -C $main status --porcelain 2>$null)
$beforeSet = @{}; $baseline | ForEach-Object { $beforeSet[$_] = $true }
$diff = $after | Where-Object { -not $beforeSet.ContainsKey($_) }
if ($diff.Count) {
  Write-Host "  ⛔ 验证失败：主工作区出现基线之外的变化："
  $diff | Select-Object -First 20 | ForEach-Object { Write-Host "    $_" }
  exit 3
} else {
  Write-Host "  ✅ 通过：主工作区与基线一致，无级联变化。"
}
Remove-Item -LiteralPath $baselineFile -ErrorAction SilentlyContinue
Write-Host "DONE"