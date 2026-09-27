$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$guard = Join-Path $root 'scripts/guard-shared-root-writes.ps1'
if (-not (Test-Path -LiteralPath $guard)) { throw 'guard script missing: ' + $guard }

$tmpRoot = Join-Path ([IO.Path]::GetTempPath()) ('mp-write-guard-' + [guid]::NewGuid().ToString('N'))
$passed = 0
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw "FAIL: $message" }; $script:passed++; Write-Host "PASS: $message" }

# 夹具必须与真实工作树同形，否则「status 恢复干净」量的是 git 的换行启发式而不是守卫。
# 两条实测（本机 8 格对照：{混合行尾,单 LF} × {无属性, text=auto} × {autocrlf false,true}）：
#   1) 索引要由 checkout 建立。`git init` + `git add` 现场造的索引不带 git 的转换状态，
#      守卫用 `git restore --source=HEAD --worktree` 恢复后 git 照样把该文件报成已修改：
#      init+add 形态 5/8 格脏，clone 形态 8/8 格干净；且「纯 git restore」与「经守卫恢复」
#      逐格完全相同 —— 脏不脏与守卫无关。
#   2) 工作树 EOL 形态要由夹具自己的 .gitattributes 声明，不能留给宿主配置。真仓根
#      .gitattributes 是 `* text=auto`，其落地形态取决于宿主 core.autocrlf：本机 false 得 LF，
#      GitHub windows runner 默认 true 得 CRLF。本文件之前的「CI 红、本机绿」正是这一档差异
#      （run 36313053992 / step Gate 2d），所以这里两档都跑，使结论与宿主配置无关。
# 夹具内所有写入一律 [IO.File]::WriteAllText（显式 LF），不用 Set-Content：Set-Content 会在值尾
# 再补一个宿主换行符，写出 `'\n\r\n` 这种混合行尾（上面那 5 格的触发条件），且 Windows
# PowerShell 5.1 的 -Encoding UTF8 会加 BOM、pwsh 7 不加，同一夹具在两个 shell 下字节不同。
function New-Fixture([string]$eolTag) {
    $dir = Join-Path $tmpRoot $eolTag
    $src = Join-Path $dir 'src'
    $repo = Join-Path $dir 'clone'
    $quarantine = Join-Path $dir 'quarantine'
    New-Item -ItemType Directory -Force -Path $src, $quarantine | Out-Null
    Push-Location $src
    & git init -q
    & git config user.name 'Write Guard Test'
    & git config user.email 'guard@test.local'
    New-Item -ItemType Directory -Force -Path 'apps' | Out-Null
    New-Item -ItemType Directory -Force -Path 'docs' | Out-Null
    [IO.File]::WriteAllText((Join-Path $src 'apps/tracked.js'), "export const tracked = 'v1'`n")
    [IO.File]::WriteAllText((Join-Path $src 'docs/readme.md'), "# docs`n")
    # 与真实仓库同形：真仓 .gitignore 含 .agent_context/，而守卫拦截时会往仓库根写
    # .agent_context/write-guard-alert.json 供后续会话感知。不在夹具里忽略它，
    # 下面的「restore 后 status 仍干净」会把这个设计内的告警文件误判为脏。
    [IO.File]::WriteAllText((Join-Path $src '.gitignore'), "node_modules/`ndist/`n.agent_context/`n")
    [IO.File]::WriteAllText((Join-Path $src '.gitattributes'), "* text eol=$eolTag`n*.sh text eol=lf`n")
    & git add -A
    & git commit -q -m 'fixture'
    Pop-Location
    Assert ($LASTEXITCODE -eq 0) "[$eolTag] fixture source repository is created"
    & git clone -q $src $repo
    Assert ($LASTEXITCODE -eq 0) "[$eolTag] fixture working tree comes from a checkout, not from git add"
    New-Item -ItemType Directory -Force -Path (Join-Path $repo 'node_modules/pkg') | Out-Null
    # clone 不继承源仓的仓库级身份，只继承宿主全局身份；下面的嵌套提交不能依赖宿主配了什么，
    # 否则在没有全局身份的干净 runner 上会以「unable to auto-detect email address」红一条无关断言。
    & git -C $repo config user.name 'Write Guard Test'
    & git -C $repo config user.email 'guard@test.local'
    return @{ Repo = $repo; Quarantine = $quarantine; Eol = $eolTag }
}

function Write-RepoFile([hashtable]$fx, [string]$rel, [string]$text) {
    [IO.File]::WriteAllText((Join-Path $fx.Repo $rel), $text)
}
function Read-RepoFile([hashtable]$fx, [string]$rel) {
    return [IO.File]::ReadAllText((Join-Path $fx.Repo $rel))
}
function StatusLines([hashtable]$fx) { return @(& git -C $fx.Repo status --porcelain=v1) }
function ViolationCount([hashtable]$fx) {
    $log = Join-Path $fx.Quarantine 'violations.jsonl'
    if (-not (Test-Path -LiteralPath $log)) { return 0 }
    return @(Get-Content -LiteralPath $log | Where-Object { $_.Trim() }).Count
}
function Invoke-Guard([hashtable]$fx, [string]$rel) {
    $common = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $guard, '-Root', $fx.Repo, '-QuarantineRoot', $fx.Quarantine, '-ProcessPaths', $rel, '-Quiet')
    & powershell.exe @common
    if ($LASTEXITCODE -ne 0) { throw "guard failed for $rel (rc=$LASTEXITCODE)" }
}

function Invoke-GuardCases([hashtable]$fx) {
    $eol = $fx.Eol
    # 「恢复干净」在两档下都必须成立，且各自必须见到自己那一档的工作树形态；
    # 后一条是为了让第二格不可退化成第一格的复制（eolTag 被写死时它立刻红）。
    $crExpected = ($eol -eq 'crlf')

    Write-RepoFile $fx 'apps/untracked.js' 'console.log(1)'
    Invoke-Guard $fx 'apps/untracked.js'
    Assert (-not (Test-Path -LiteralPath (Join-Path $fx.Repo 'apps/untracked.js'))) "[$eol] untracked runtime file is quarantined"
    Assert ((Get-ChildItem -LiteralPath $fx.Quarantine -Recurse -File | Where-Object { $_.Name -like '*untracked.js' }).Count -eq 1) "[$eol] quarantine contains untracked copy"
    Assert (Test-Path -LiteralPath (Join-Path $fx.Quarantine 'violations.jsonl')) "[$eol] violation log is written outside repo"

    Write-RepoFile $fx 'apps/tracked.js' "export const tracked = 'v2'`n"
    Invoke-Guard $fx 'apps/tracked.js'
    $restored = Read-RepoFile $fx 'apps/tracked.js'
    # 断言读**工作树**，不读 `git show HEAD:`：HEAD 里永远是 v1，守卫什么都不恢复它也照样通过，
    # 那是一条装饰性断言（上一版第 45 行即是）。
    Assert ($restored -match "tracked = 'v1'") "[$eol] tracked content in the work tree is back to v1"
    Assert ($restored -notmatch "tracked = 'v2'") "[$eol] the intercepted write is gone from the work tree"
    Assert ((StatusLines $fx).Count -eq 0) "[$eol] shared status stays clean after tracked restore"
    Assert ($restored.Contains("`r") -eq $crExpected) "[$eol] restore reproduced this repo's declared work-tree EOL form"

    Write-RepoFile $fx 'docs/new.md' '# allowed'
    Invoke-Guard $fx 'docs/new.md'
    Assert (Test-Path -LiteralPath (Join-Path $fx.Repo 'docs/new.md')) "[$eol] docs directory write is allowed"
    Remove-Item -LiteralPath (Join-Path $fx.Repo 'docs/new.md') -Force

    Write-RepoFile $fx 'node_modules/pkg/new.js' 'module.exports = 2'
    Invoke-Guard $fx 'node_modules/pkg/new.js'
    Assert (Test-Path -LiteralPath (Join-Path $fx.Repo 'node_modules/pkg/new.js')) "[$eol] gitignored artifact is allowed"

    Remove-Item -LiteralPath (Join-Path $fx.Repo 'apps/tracked.js') -Force
    Invoke-Guard $fx 'apps/tracked.js'
    Assert ((Read-RepoFile $fx 'apps/tracked.js') -match "tracked = 'v1'") "[$eol] deleted tracked file is restored with its content"
    Assert ((StatusLines $fx).Count -eq 0) "[$eol] status is clean after delete restore"

    New-Item -ItemType Directory -Force -Path (Join-Path $fx.Repo 'apps/nested') | Out-Null
    Write-RepoFile $fx 'apps/nested/inside.js' 'export default 99'
    & git -C $fx.Repo add apps/nested/inside.js
    & git -C $fx.Repo commit -q -m 'nested fixture'
    $violationBaseline = ViolationCount $fx
    Invoke-Guard $fx 'apps/nested'
    Assert (Test-Path -LiteralPath (Join-Path $fx.Repo 'apps/nested/inside.js')) "[$eol] directory event does not quarantine tracked subtree"
    Assert ((StatusLines $fx).Count -eq 0) "[$eol] status stays clean after directory event"
    Assert ((ViolationCount $fx) -eq $violationBaseline) "[$eol] directory event is not recorded as a violation"

    $violations = @(Get-Content -LiteralPath (Join-Path $fx.Quarantine 'violations.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
    Assert (($violations | Measure-Object).Count -ge 2) "[$eol] violation log records intercepted writes"
}

try {
    foreach ($eol in @('lf', 'crlf')) {
        Invoke-GuardCases (New-Fixture $eol)
    }
    # 规模锁：两档 EOL 各 17 条。少跑一格（EOL 档位被删掉、或某条 Assert 被摘）都必须在这里变红，
    # 否则"第二格其实没在跑"这种退化在日志里完全看不出来。
    Assert ($passed -eq 34) "both EOL cells ran to completion (expect 34 checks, got $passed)"
    Write-Host "PASS: $passed session write guard checks" -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
