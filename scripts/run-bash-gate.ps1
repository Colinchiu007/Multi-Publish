# 在 Git for Windows Bash 中执行仓库 .sh 门禁脚本（如 scripts/check-docs-sync.sh）。
# 解决两个本机陷阱：
#   1) 裸 bash 解析到 WSL shim（C:\windows\system32\bash.exe），WSL git 无法穿透
#      worktree .git 指针里的 Windows 路径（gitdir: D:/...）；
#   2) core.autocrlf 把 .sh checkout 成 CRLF，bash 执行报 $'\r'。
# 用法示例：
#   & scripts/run-bash-gate.ps1 -Script scripts/check-docs-sync.sh `
#       -RepoRoot <worktree根> -ScriptArgs @('--base=main','--head=HEAD')
param(
    [Parameter(Mandatory = $true)][string]$Script,
    [string]$RepoRoot = '',
    [string[]]$ScriptArgs = @(),
    [string]$GitBash = ''
)
$ErrorActionPreference = 'Stop'

function ConvertTo-BashPath([string]$p) {
    $q = $p -replace '\\', '/'
    if ($q -match '^([A-Za-z]):') { $q = '/' + $Matches[1].ToLower() + $q.Substring(2) }
    return $q
}

# ---- 定位 Git for Windows Bash（与 start-mp-task.ps1 同一探测链，绝不落到 WSL bash）----
# 身份校验：Git for Windows 的 bash.exe 必在 <GitRoot>\usr\bin\bash.exe 或
# <GitRoot>\bin\bash.exe，且同根 usr\bin\dirname.exe 存在；WSL shim（system32\bash.exe）
# 路径模式不符，直接拒绝。
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
    throw "指定的 bash 不是 Git for Windows Bash（$bash）；请通过 -GitBash / MP_GIT_BASH 指定 <GitRoot>\usr\bin\bash.exe，禁止使用 WSL/裸 bash"
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
    throw '未找到 Git for Windows Bash；请安装 Git for Windows，或通过 -GitBash / MP_GIT_BASH 指定 bash.exe（禁止使用裸 bash，它会解析到 WSL）'
}

# ---- 解析仓库根与脚本路径 ----
if (-not $RepoRoot) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$repoFull = (Resolve-Path -LiteralPath $RepoRoot).Path
if ([System.IO.Path]::IsPathRooted($Script)) { $scriptFull = (Resolve-Path -LiteralPath $Script).Path }
else { $scriptFull = (Resolve-Path -LiteralPath (Join-Path $repoFull $Script)).Path }

# ---- 去 CR 后落临时文件执行（对历史 worktree 的 CRLF 残留双保险）----
$text = [System.IO.File]::ReadAllText($scriptFull)
$text = $text -replace "`r", ''
$tmp = Join-Path $env:TEMP ('bash-gate-' + [System.IO.Path]::GetRandomFileName() + '.sh')
[System.IO.File]::WriteAllText($tmp, $text, (New-Object System.Text.UTF8Encoding($false)))

try {
    $argStr = ($ScriptArgs | ForEach-Object { "'" + ($_ -replace "'", "'\\''") + "'" }) -join ' '
    $inner = 'cd ' + (ConvertTo-BashPath $repoFull) + ' && bash ' + (ConvertTo-BashPath $tmp)
    if ($argStr) { $inner += ' ' + $argStr }
    & $bash -lc $inner
    exit $LASTEXITCODE
} finally {
    Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
}
