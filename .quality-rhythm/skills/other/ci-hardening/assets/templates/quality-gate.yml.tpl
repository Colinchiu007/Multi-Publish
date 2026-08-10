# quality-gate — 并行化质量门禁（ci-hardening 模板）
# 用法：scripts/apply-ci-hardening.js 渲染生成；保留全部 gate 语义 + 触发去重。
name: quality-gate

on:
  pull_request:
    branches: [{{DEFAULT_BRANCH}}]
  workflow_dispatch:

jobs:
  static-gates:
    name: QG Static
    runs-on: {{RUNNER_OS}}
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "{{NODE_VERSION}}"
          cache: "{{PACKAGE_MANAGER}}"
      - name: Install deps
        run: {{INSTALL_CMD}}
      - name: "Gate 1 - TypeScript 编译检查"
        run: {{TSC_CMD}}
      - name: "Gate 2 - JS syntax integrity"
        run: |
          $errors = 0
          Get-ChildItem -Recurse -Filter "*.js" -Path {{JS_SYNTAX_ROOT}} -Exclude "*node_modules*" | ForEach-Object {
            $result = node --check $_.FullName 2>&1
            if ($LASTEXITCODE -ne 0) { Write-Host "  [FAIL] $($_.FullName)"; $errors++ }
          }
          if ($errors -gt 0) { exit 1 }
          Write-Host "All JS files pass syntax check"
      - name: "Gate 3 - Hardcoded secrets scan"
        run: {{SECRETS_SCAN_CMD}}
      - name: "Gate 6 - IPC bridge completeness"   # 非 Electron 项目可移除
        id: ipc-check
        run: {{IPC_CHECK_CMD}}

  unit-tests:
    name: QG Unit Tests
    runs-on: {{RUNNER_OS}}
    timeout-minutes: {{UNIT_TIMEOUT}}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "{{NODE_VERSION}}"
          cache: "{{PACKAGE_MANAGER}}"
      - name: Install deps
        run: {{INSTALL_CMD}}
      - name: "Gate 4 - Workspace unit tests"
        shell: pwsh
        run: |
          function Get-TestProcessTree {
            param([int] $RootProcessId)
            $processes = @(Get-CimInstance Win32_Process)
            $processIds = [System.Collections.Generic.HashSet[int]]::new()
            [void] $processIds.Add($RootProcessId)
            $foundChild = $true
            while ($foundChild) {
              $foundChild = $false
              foreach ($process in $processes) {
                if ($processIds.Contains([int] $process.ParentProcessId) -and $processIds.Add([int] $process.ProcessId)) {
                  $foundChild = $true
                }
              }
            }
            $processes | Where-Object { $processIds.Contains([int] $_.ProcessId) } |
              Select-Object ProcessId, ParentProcessId, Name
          }
          $testProcess = Start-Process -FilePath "{{PM_BIN}}" `
            -ArgumentList @({{UNIT_ARGS}}) -NoNewWindow -PassThru
          if (-not $testProcess.WaitForExit(1800000)) {
            Write-Host "Gate 4 exceeded its 30-minute execution budget."
            Get-TestProcessTree -RootProcessId $testProcess.Id | Format-Table -AutoSize
            taskkill /PID $testProcess.Id /T /F 2>$null | Out-Null
            throw "Gate 4 timed out; terminated the npm process tree."
          }
          if ($testProcess.ExitCode -ne 0) {
            Get-TestProcessTree -RootProcessId $testProcess.Id | Format-Table -AutoSize
            exit $testProcess.ExitCode
          }
          $remainingTestProcesses = @(Get-TestProcessTree -RootProcessId $testProcess.Id)
          if ($remainingTestProcesses.Count -gt 0) {
            Write-Host "Gate 4 completed but left test child processes alive."
            $remainingTestProcesses | Format-Table -AutoSize
            foreach ($process in $remainingTestProcesses) {
              taskkill /PID $process.ProcessId /T /F 2>$null | Out-Null
            }
            throw "Gate 4 left child processes alive after npm exited."
          }
      - name: "Gate 4b - Startup and require smoke tests"
        run: {{STARTUP_SMOKE_CMD}}

  coverage:
    name: QG Coverage
    runs-on: {{RUNNER_OS}}
    timeout-minutes: {{UNIT_TIMEOUT}}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "{{NODE_VERSION}}"
          cache: "{{PACKAGE_MANAGER}}"
      - name: Install deps
        run: {{INSTALL_CMD}}
      - name: "Gate 5 - Test coverage check"
        run: {{COVERAGE_CMD}}

  visual:
    name: QG Visual
    runs-on: {{RUNNER_OS}}
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "{{NODE_VERSION}}"
          cache: "{{PACKAGE_MANAGER}}"
      - name: Install deps
        run: {{INSTALL_CMD}}
      - name: "Gate 7 - Visual regression"
        shell: pwsh
        env:
          TEST_URL: http://127.0.0.1:5174
          HEADLESS: "true"
          PIXEL_THRESHOLD: "0.02"
        run: {{VISUAL_CMD}}
      - name: "Upload GUI quality artifacts"
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: quality-gate-visual-reports
          path: |
            {{VISUAL_ARTIFACTS}}
          if-no-files-found: ignore
          retention-days: 7

  e2e:
    name: QG Browser E2E
    runs-on: {{RUNNER_OS}}
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "{{NODE_VERSION}}"
          cache: "{{PACKAGE_MANAGER}}"
      - name: Install deps
        run: {{INSTALL_CMD}}
      - name: Install Playwright (for Browser E2E)
        run: {{PLAYWRIGHT_INSTALL_CMD}}
      - name: "Gate 8 - Browser E2E"
        id: e2e-gate
        shell: pwsh
        run: {{E2E_CMD}}
      - name: "Upload GUI quality artifacts"
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: quality-gate-e2e-reports
          path: |
            {{E2E_ARTIFACTS}}
          if-no-files-found: ignore
          retention-days: 7

  gate-result:
    name: Gate Result
    runs-on: ubuntu-latest
    needs: [static-gates, unit-tests, coverage, visual, e2e]
    if: always()
    timeout-minutes: 5
    steps:
      - name: "Gate result"
        run: |
          echo "=============================="
          echo "  quality-rhythm CI gate report"
          echo "=============================="
          echo "static       : ${{ needs.static-gates.result }}"
          echo "unit tests   : ${{ needs.unit-tests.result }}"
          echo "coverage     : ${{ needs.coverage.result }}"
          echo "visual gate  : ${{ needs.visual.result }}"
          echo "browser E2E  : ${{ needs.e2e.result }}"
          echo "=============================="
