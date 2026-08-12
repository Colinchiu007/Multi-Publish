<#
.SYNOPSIS
安全恢复被删文件（AGENTS.md 防护铁律 R2 落地）。

.DESCRIPTION
先备份与被删文件同目录的未提交修改，再按 git status 精确 D 清单逐个恢复，
避免 `git checkout -- <目录>` 宽路径误伤未提交修改。恢复后校验 D 归零。

.PARAMETER MainWorkspace
主工作区路径（默认当前仓库根）。
#>
param(
  [string]$MainWorkspace = (git rev-parse --show-toplevel 2>$null)
)

$ErrorActionPreference = 'Stop'
if (-not $MainWorkspace) { Write-Host "无法定位主工作区，请用 -MainWorkspace 指定。"; exit 1 }
$main = [System.IO.Path]::GetFullPath($MainWorkspace)

$status = @(git -C $main status --porcelain 2>$null)
$deleted = $status | Where-Object { $_ -match '^( D|D )' }
if (-not $deleted.Count) { Write-Host "无被删文件（D）。无需恢复。"; exit 0 }

$paths = $deleted | ForEach-Object { $_.Substring(3).Trim() }

Write-Host "=== 备份同目录未提交修改（非 D 的 M/A） ==="
$backupDir = Join-Path $env:TEMP ("mp-restore-backup-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$changed = @()
foreach ($p in $paths) {
  $dir = Split-Path (Join-Path $main $p) -Parent
  foreach ($m in ($status | Where-Object { $_ -match '^( M|A )' } | ForEach-Object { $_.Substring(3).Trim() })) {
    if ($m -like "$($dir.Replace('\','/'))/*" -or $m -like "$($dir.Replace('\','/'))") {
      $rel = $m
      $dst = Join-Path $backupDir ($rel -replace '[/\\]', '__')
      Copy-Item -LiteralPath (Join-Path $main $m) -Destination $dst -Force
      $changed += $m
    }
  }
}
if ($changed.Count) {
  Write-Host "  已备份 $($changed.Count) 个未提交修改 -> $backupDir"
  $changed | ForEach-Object { Write-Host "    $_" }
} else {
  Write-Host "  无同目录未提交修改（或已备份为空）"
}

Write-Host "=== 按精确清单恢复 D 文件 ==="
foreach ($p in $paths) {
  & git -C $main checkout -- $p 2>&1 | Out-Null
  Write-Host "  恢复: $p"
}

Write-Host "=== 验证 ==="
$remain = @(git -C $main status --porcelain 2>$null | Where-Object { $_ -match '^( D|D )' })
if ($remain.Count) {
  Write-Host "  ⚠️ 仍有 $($remain.Count) 个 D 未恢复："
  $remain | Select-Object -First 10 | ForEach-Object { Write-Host "    $_" }
  exit 1
}
Write-Host "  ✅ D 已全部恢复。"
Write-Host "  备份保留在 $backupDir（确认无误后手动删除；误伤时可从这里还原）。"
Write-Host "DONE"