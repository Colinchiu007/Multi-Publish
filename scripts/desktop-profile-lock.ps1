#requires -Version 7
<#
.SYNOPSIS
  识别占用指定 ELECTRON_USER_DATA_DIR profile 的 Electron 进程，并按
  worktree 归属分类，供 start-desktop.ps1 做跨 worktree 单实例锁
  fail-closed 检查。
#>

function Get-ProfileElectronOwners {
  <#
  .SYNOPSIS
    扫描所有 electron.exe，返回 CommandLine 携带指定 --user-data-dir 的实例。
  #>
  param(
    [Parameter(Mandatory)][string]$ProfilePath
  )
  $rx = '--user-data-dir=("?' + [regex]::Escape($ProfilePath) + '"?)(?=\s|$)'
  Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match $rx) } |
    ForEach-Object {
      [pscustomobject]@{
        Pid        = $_.ProcessId
        ExePath    = $_.ExecutablePath
        IsMain     = ($_.CommandLine -notmatch '--type=')
        CommandLine = $_.CommandLine
      }
    }
}

function Get-ProfileLockReport {
  <#
  .SYNOPSIS
    按 RepoRoot 把 profile owner 分为 Same/Foreign，返回冲突报告。
    可通过 -Owners 注入（测试用）；缺省自动扫描。
  #>
  param(
    [Parameter(Mandatory)][string]$ProfilePath,
    [Parameter(Mandatory)][string]$RepoRoot,
    [object[]]$Owners
  )
  if ($null -eq $Owners) { $Owners = @(Get-ProfileElectronOwners -ProfilePath $ProfilePath) }
  $same    = @($Owners | Where-Object { $_.ExePath -and ($_.ExePath -like "$RepoRoot*") })
  $foreign = @($Owners | Where-Object { -not ($_.ExePath -and ($_.ExePath -like "$RepoRoot*")) })
  [pscustomobject]@{
    ProfilePath = $ProfilePath
    RepoRoot    = $RepoRoot
    Owners      = $Owners
    Same        = $same
    Foreign     = $foreign
    ForeignMain = @($foreign | Where-Object { $_.IsMain })
    HasForeign  = ($foreign.Count -gt 0)
  }
}
