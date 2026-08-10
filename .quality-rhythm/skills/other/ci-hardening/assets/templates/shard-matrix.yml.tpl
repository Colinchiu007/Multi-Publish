# 大测试套件跨 runner 分片（ci-hardening M8 模板）— 追加到 quality-gate.yml 的 jobs: 下
# 前提：已实测单测阶段是 CI 关键路径；分片后瓶颈会转移（如 coverage），需重新评估
# 占位：{{SHARD_JOB_NAME}}/{{SHARD_JOB_TITLE}}/{{SHARD_COUNT}}/{{TEST_WORKSPACE}}/{{SHARD_TIMEOUT}}
# 进程内保持串行确定性参数（maxWorkers=1 / no-file-parallelism / 超时）；gate-result needs 需纳入本 job
  {{SHARD_JOB_NAME}}:
    name: {{SHARD_JOB_TITLE}}
    runs-on: {{RUNNER_OS}}
    timeout-minutes: {{SHARD_TIMEOUT}}
    strategy:
      fail-fast: false
      matrix:
        shard: ["1/{{SHARD_COUNT}}", "2/{{SHARD_COUNT}}"]
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "{{NODE_VERSION}}"
          cache: "{{PACKAGE_MANAGER}}"
      - name: Install deps
        run: {{INSTALL_CMD}}
      # 跨 runner 隔离 = 设计（独立机器无共享可变资源）；每 shard 保留 watchdog（契约测试守护）
      - name: "{{SHARD_JOB_TITLE}} shard ${{ matrix.shard }}"
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
            $processes | Where-Object { $processIds.Contains([int] $_.ProcessId) } | Select-Object ProcessId, ParentProcessId, Name
          }
          $testProcess = Start-Process -FilePath "{{NPM_CMD}}" `
            -ArgumentList @("run", "test", "-w", "{{TEST_WORKSPACE}}", "--", "--shard=${{ matrix.shard }}", "--maxWorkers=1", "--no-file-parallelism", "--reporter=verbose", "--testTimeout=10000", "--hookTimeout=10000", "--teardownTimeout=10000") `
            -NoNewWindow -PassThru
          if (-not $testProcess.WaitForExit(1800000)) {
            Write-Host "Shard exceeded its 30-minute execution budget."
            Get-TestProcessTree -RootProcessId $testProcess.Id | Format-Table -AutoSize
            taskkill /PID $testProcess.Id /T /F 2>$null | Out-Null
            throw "Shard timed out; terminated the npm process tree."
          }
          if ($testProcess.ExitCode -ne 0) {
            Get-TestProcessTree -RootProcessId $testProcess.Id | Format-Table -AutoSize
            exit $testProcess.ExitCode
          }
          $remainingTestProcesses = @(Get-TestProcessTree -RootProcessId $testProcess.Id)
          if ($remainingTestProcesses.Count -gt 0) {
            $remainingTestProcesses | Format-Table -AutoSize
            foreach ($process in $remainingTestProcesses) { taskkill /PID $process.ProcessId /T /F 2>$null | Out-Null }
            throw "Shard left child processes alive after npm exited."
          }
# gate-result 汇总：needs: [..., {{SHARD_JOB_NAME}}] 并打印 ${{ needs.{{SHARD_JOB_NAME}}.result }}
# 注意：该 job 不经 nx → 不要加 Restore Nx cache（空缓存 + 与 nx job 争写同一 key）
