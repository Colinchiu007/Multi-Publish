$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$guard = Join-Path $root 'scripts/guard-shared-root-writes.ps1'
if (-not (Test-Path -LiteralPath $guard)) { throw 'guard script missing: ' + $guard }

$tmpRoot = Join-Path ([IO.Path]::GetTempPath()) ('mp-write-guard-' + [guid]::NewGuid().ToString('N'))
$quarantine = Join-Path $tmpRoot 'quarantine'
$repo = Join-Path $tmpRoot 'repo'
New-Item -ItemType Directory -Force -Path $repo | Out-Null
New-Item -ItemType Directory -Force -Path $quarantine | Out-Null
$passed = 0
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw "FAIL: $message" }; $script:passed++; Write-Host "PASS: $message" }
try {
    Push-Location $repo
    & git init -q
    & git config user.name 'Write Guard Test'
    & git config user.email 'guard@test.local'
    New-Item -ItemType Directory -Force -Path 'apps' | Out-Null
    New-Item -ItemType Directory -Force -Path 'docs' | Out-Null
    New-Item -ItemType Directory -Force -Path 'node_modules/pkg' | Out-Null
    Set-Content -LiteralPath 'apps/tracked.js' -Value "export const tracked = 'v1'`n" -Encoding UTF8
    Set-Content -LiteralPath 'docs/readme.md' -Value '# docs' -Encoding UTF8
    Set-Content -LiteralPath 'node_modules/pkg/index.js' -Value 'module.exports = 1' -Encoding UTF8
    Set-Content -LiteralPath '.gitignore' -Value "node_modules/`ndist/`n" -Encoding UTF8
    & git add -A
    & git commit -q -m 'fixture'
    Pop-Location
    Assert ($LASTEXITCODE -eq 0) 'temporary git repository is created'

    $common = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$guard,'-Root',$repo,'-QuarantineRoot',$quarantine)
    function GuardPath([string]$path) { & powershell.exe @common -ProcessPaths $path -Quiet; if ($LASTEXITCODE -ne 0) { throw "guard failed for $path" } }

    Set-Content -LiteralPath (Join-Path $repo 'apps/untracked.js') -Value 'console.log(1)' -Encoding UTF8
    GuardPath 'apps/untracked.js'
    Assert (-not (Test-Path -LiteralPath (Join-Path $repo 'apps/untracked.js'))) 'untracked runtime file is quarantined'
    Assert ((Get-ChildItem -LiteralPath $quarantine -Recurse -File | Where-Object { $_.Name -like '*untracked.js' }).Count -eq 1) 'quarantine contains untracked copy'
    Assert (Test-Path -LiteralPath (Join-Path $quarantine 'violations.jsonl')) 'violation log is written outside repo'

    Set-Content -LiteralPath (Join-Path $repo 'apps/tracked.js') -Value "export const tracked = 'v2'`n" -Encoding UTF8
    GuardPath 'apps/tracked.js'
    $restored = (git -C $repo show HEAD:apps/tracked.js) -join "`n"
    Assert ($restored -match "tracked = 'v1'") 'tracked file is restored from HEAD'
    Assert ((git -C $repo status --porcelain=v1 | Measure-Object).Count -eq 0) 'shared status stays clean after tracked restore'

    Set-Content -LiteralPath (Join-Path $repo 'docs/new.md') -Value '# allowed' -Encoding UTF8
    GuardPath 'docs/new.md'
    Assert (Test-Path -LiteralPath (Join-Path $repo 'docs/new.md')) 'docs directory write is allowed'
    Remove-Item -LiteralPath (Join-Path $repo 'docs/new.md') -Force

    Set-Content -LiteralPath (Join-Path $repo 'node_modules/pkg/new.js') -Value 'module.exports = 2' -Encoding UTF8
    GuardPath 'node_modules/pkg/new.js'
    Assert (Test-Path -LiteralPath (Join-Path $repo 'node_modules/pkg/new.js')) 'gitignored artifact is allowed'

    Remove-Item -LiteralPath (Join-Path $repo 'apps/tracked.js') -Force
    GuardPath 'apps/tracked.js'
    Assert (Test-Path -LiteralPath (Join-Path $repo 'apps/tracked.js')) 'deleted tracked file is restored'
    Assert ((git -C $repo status --porcelain=v1 | Measure-Object).Count -eq 0) 'status is clean after delete restore'

    $violations = @(Get-Content -LiteralPath (Join-Path $quarantine 'violations.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
    Assert (($violations | Measure-Object).Count -ge 2) 'violation log records intercepted writes'
    Write-Host "PASS: $passed session write guard checks" -ForegroundColor Green
} finally {
    Pop-Location -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
