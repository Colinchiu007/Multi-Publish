<#
.SYNOPSIS
CCG 评审统一入口（PowerShell）——自动定位并校验 Git for Windows Bash。

.DESCRIPTION
本仓的 CCG 评审入口是 shell 脚本（scripts/deep-review.sh、scripts/plan-review.sh），
但**在 PowerShell 里不能靠裸 `bash` 调用**：本机裸 bash 解析到 WSL shim
（C:\windows\system32\bash.exe），不是 Git Bash。实测后果不是报错退出，
而是一串指向错误的排查建议（HOME 指向 WSL 的 /home/<user> ⇒ 找不到 node /
找不到 codeagent-wrapper ⇒ 建议「设置 CCG_ARL_DIR」，而该变量三级作用域都不存在），
排查者会在一个幻影变量上耗掉整个会话。

本入口把「定位 Git Bash + 身份校验 + 派发」三件事收在一处：

  1. 定位 Git Bash，探测链与 run-bash-gate.ps1 / start-mp-task.ps1 完全一致
     （MP_GIT_BASH 覆盖 → 由 git --exec-path 派生 → 硬编码候选）；
  2. 身份校验：必须是 <GitRoot>\usr\bin\bash.exe 或 <GitRoot>\bin\bash.exe，
     且同根 usr\bin\dirname.exe 存在。WSL shim 与 MSYS 的 Cygwin 精简安装都
     不满足该形态，直接拒绝 —— 这是本脚本存在的全部意义；
  3. 派发到 deep-review.sh（验证层 / objectType=code）或
     plan-review.sh（决策层 / objectType=plan），并原样透传退出码。

刻意不做的事：不自动设置任何环境变量。PATH/后端解析由 .sh 脚本自己负责
（deep-review.sh 有完整的 ABS-prepend 兜底，见其「后端解析」段落），
PowerShell 这边插手只会制造第二套真源。

.PARAMETER Mode
Deep = 提交后的代码审查（deep-review.sh）；Plan = 动手前的方案对抗评审
（plan-review.sh，需配合 -Proposal）。

.PARAMETER Proposal
方案文件路径，仅 Mode=Plan 时需要。

.PARAMETER GitBash
显式指定 Git Bash 路径。默认自动探测，也可用环境变量 MP_GIT_BASH 覆盖。

.EXAMPLE
.\scripts\ccg-review.ps1 -Mode Deep

.EXAMPLE
.\scripts\ccg-review.ps1 -Mode Plan -Proposal 01-docs\plan.md

.EXAMPLE
# 只想体检后端依赖（不跑评审）
.\scripts\ccg-review.ps1 -Mode Deep -CheckDeps
#>
param(
    [ValidateSet('Deep', 'Plan')]
    [string]$Mode = 'Deep',
    [string]$Proposal = '',
    [switch]$CheckDeps,
    [switch]$Force,
    [switch]$DryRun,
    [string]$GitBash = ''
)

$ErrorActionPreference = 'Stop'

# Windows 风格路径 → Git Bash 风格路径。
function ConvertTo-BashPath([string]$p) {
    $q = $p -replace '\\', '/'
    if ($q -match '^([A-Za-z]):') { $q = '/' + $Matches[1].ToLower() + $q.Substring(2) }
    return $q
}

# POSIX 单引号包裹，与 run-bash-gate.ps1 同一套转义（单引号内一切字面）。
#
# ⚠ 不要只给用户参数包一层就完事（QM-6 评审 i2）：仓库路径与脚本路径**同样含空格**
# （C:\Program Files 下必中招），`cd <路径> && sh <脚本>` 一旦不包，整条命令会被拆段。
# 首版只给 $scriptArgs 加了引号、路径裸拼，属不一致。
function Quote-Bash([string]$s) {
    return "'" + ($s -replace "'", "'\''") + "'"
}

# ---- 定位 Git for Windows Bash（探测链与 run-bash-gate.ps1 / start-mp-task.ps1 同一套）----
# 身份校验：Git for Windows 的 bash.exe 必在 <GitRoot>\usr\bin\bash.exe 或
# <GitRoot>\bin\bash.exe，且同根 usr\bin\dirname.exe 存在。
# WSL shim（C:\windows\system32\bash.exe）路径形态不符，直接拒绝 ——
# 那正是本脚本要根治的东西，所以它必须被显式点名而不是静默失败。
function Test-GitBashIdentity([string]$candidate) {
    if (-not $candidate -or -not (Test-Path -LiteralPath $candidate)) { return $false }
    $gitRoot = $null
    foreach ($rel in @('usr\bin\bash.exe', 'bin\bash.exe')) {
        if ($candidate -like "*\$rel") {
            $gitRoot = $candidate.Substring(0, $candidate.Length - $rel.Length).TrimEnd('\')
            break
        }
    }
    if (-not $gitRoot) { return $false }
    return (Test-Path -LiteralPath (Join-Path $gitRoot 'usr\bin\dirname.exe'))
}

$bash = $GitBash
if (-not $bash -and $env:MP_GIT_BASH) { $bash = $env:MP_GIT_BASH }
if ($bash -and -not (Test-GitBashIdentity $bash)) {
    throw "指定的 bash 不是 Git for Windows Bash（$bash）；请通过 -GitBash / MP_GIT_BASH 指定 <GitRoot>\usr\bin\bash.exe，禁止使用 WSL/裸 bash（C:\windows\system32\bash.exe 是 WSL shim）"
}
if (-not $bash) {
    $gitCmd = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($gitCmd -and $gitCmd.Source) {
        $candidate = Join-Path (Split-Path (Split-Path $gitCmd.Source -Parent) -Parent) 'usr\bin\bash.exe'
        if (Test-GitBashIdentity $candidate) { $bash = $candidate }
    }
}
if (-not $bash) {
    foreach ($candidate in @('C:\Program Files\Git\usr\bin\bash.exe', 'C:\Program Files (x86)\Git\usr\bin\bash.exe', 'D:\Program Files\Git\usr\bin\bash.exe')) {
        if (Test-GitBashIdentity $candidate) { $bash = $candidate; break }
    }
}
if (-not $bash) {
    throw '未找到 Git for Windows Bash；请安装 Git for Windows，或通过 -GitBash / MP_GIT_BASH 指定 bash.exe（禁止使用裸 bash，它在本机会解析到 WSL shim C:\windows\system32\bash.exe）'
}

# ---- 选脚本 ----
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($Mode -eq 'Plan') {
    $target = Join-Path $PSScriptRoot 'plan-review.sh'
    if (-not $Proposal) {
        throw 'Mode=Plan 必须给 -Proposal <方案文件>；用法：.\scripts\ccg-review.ps1 -Mode Plan -Proposal 01-docs\plan.md'
    }
    $scriptArgs = @($Proposal)
} else {
    $target = Join-Path $PSScriptRoot 'deep-review.sh'
    $scriptArgs = @()
}
if ($CheckDeps -and $Mode -eq 'Deep') { $scriptArgs += '--check-deps' }
if ($Force)  { $scriptArgs += '--force' }
if ($DryRun) { $scriptArgs += '--dry-run' }

Write-Host "GitBash:  $bash"
Write-Host "Script:   $([System.IO.Path]::GetFileName($target)) $($scriptArgs -join ' ')"
Write-Host ""

$quoted = ($scriptArgs | ForEach-Object { Quote-Bash $_ }) -join ' '
# 路径与参数走同一个 Quote-Bash，避免「参数包了、路径没包」的不一致（QM-6 评审 i2）。
$inner  = 'cd ' + (Quote-Bash (ConvertTo-BashPath $repoRoot)) +
          ' && sh ' + (Quote-Bash (ConvertTo-BashPath $target))
if ($quoted) { $inner += ' ' + $quoted }

& $bash -lc $inner
exit $LASTEXITCODE