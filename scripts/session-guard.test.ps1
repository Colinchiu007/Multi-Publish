$ErrorActionPreference = 'Stop'

$sourceRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ccg-session-guard-{0}" -f [guid]::NewGuid().ToString('N'))
$repo = Join-Path $tempRoot 'repo'
$linked = Join-Path $tempRoot 'linked'
$pass = 0
$fail = 0

function Pass([string]$Message) { $script:pass++; Write-Host "  PASS: $Message" }
function Fail([string]$Message) { $script:fail++; Write-Host "  FAIL: $Message" }
function Invoke-Git { & git @args; if ($LASTEXITCODE -ne 0) { throw "git failed: $args" } }
function Invoke-Guard([string]$WorkingDirectory, [string]$Branch) {
    $stdout = Join-Path $tempRoot ("guard-{0}.out" -f [guid]::NewGuid().ToString('N'))
    $stderr = Join-Path $tempRoot ("guard-{0}.err" -f [guid]::NewGuid().ToString('N'))
    $process = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $WorkingDirectory 'scripts/session-guard.ps1'), '-Branch', $Branch) -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Wait -PassThru
    return $process.ExitCode
}

try {
    New-Item -ItemType Directory -Force -Path (Join-Path $repo 'scripts') | Out-Null
    Invoke-Git -C $repo init -q -b main
    Invoke-Git -C $repo config user.email session-guard-test@example.com
    Invoke-Git -C $repo config user.name 'Session Guard Test'
    Invoke-Git -C $repo config commit.gpgsign false
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'scripts/session-guard.ps1') -Destination (Join-Path $repo 'scripts/session-guard.ps1')
    Set-Content -LiteralPath (Join-Path $repo 'base.txt') -Value 'base' -NoNewline
    Invoke-Git -C $repo add .
    Invoke-Git -C $repo commit -q -m base
    Invoke-Git -C $repo branch codex/feature

    if ((Invoke-Guard $repo 'codex/feature') -ne 0) { Pass 'primary root rejects feature declaration' } else { Fail 'primary root accepted feature declaration' }
    if ((Invoke-Guard $repo 'main') -eq 0 -and (Get-Content (Join-Path $repo '.agent_context/expected-branch') -Raw) -eq 'main') { Pass 'primary root accepts main declaration' } else { Fail 'primary root main declaration failed' }
    @{ pid = $PID; startedAt = (Get-Date).ToString('o'); branch = 'main'; worktree = $repo } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $repo '.agent_context/session.json') -Encoding UTF8
    if ((Invoke-Guard $repo 'main') -ne 0) { Pass 'active session declaration cannot be overwritten' } else { Fail 'active session declaration was overwritten' }
    $commonDir = (& git -C $repo rev-parse --path-format=absolute --git-common-dir).Trim()
    $lockPath = Join-Path $commonDir 'session-guard.lock'
    $heldLock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    try {
        if ((Invoke-Guard $repo 'main') -ne 0) { Pass 'session guard lock blocks concurrent declaration' } else { Fail 'session guard lock allowed concurrent declaration' }
    } finally {
        $heldLock.Dispose()
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }

    Invoke-Git -C $repo worktree add -q $linked codex/feature
    if ((Invoke-Guard $linked 'codex/feature') -eq 0 -and (Get-Content (Join-Path $linked '.agent_context/expected-branch') -Raw) -eq 'codex/feature') { Pass 'linked worktree accepts its feature declaration' } else { Fail 'linked worktree feature declaration failed' }
} finally {
    if (Test-Path $repo) { & git -C $repo worktree remove $linked --force 2>$null }
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host '----'
Write-Host "Result: PASS=$pass FAIL=$fail"
if ($fail -ne 0) { exit 1 }
