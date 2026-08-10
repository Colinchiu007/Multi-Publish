# Electron CI — Linux 平台确定性回归（ci-hardening 模板，GitHub 官方 runner）
# 注意：@electron/rebuild 必须在 vitest 之后、Electron 冒烟之前（vitest 跑在 Node ABI 下）。
name: Electron CI

on:
  pull_request:
    branches: [{{DEFAULT_BRANCH}}]
  workflow_dispatch:

jobs:
  electron-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      NODE_ENV: test
      {{SKIP_ENV_LINE}}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "{{NODE_VERSION}}"
          cache: "{{PACKAGE_MANAGER}}"
      - name: Install system deps (Xvfb + build tools + python for node-gyp)
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y -qq xvfb build-essential python3
      - name: Install dependencies
        timeout-minutes: 10
        run: {{INSTALL_CMD}}
      - name: Restore required JavaScript runtimes
        run: |
          node node_modules/esbuild/install.js
          node node_modules/vue-demi/scripts/postinstall.js
      - name: Verify Electron checksum pin
        run: |
          node -e "const checksums = require('./node_modules/electron/checksums.json'); const artifact = '{{ELECTRON_ARTIFACT}}'; const expected = '{{ELECTRON_CHECKSUM}}'; if (checksums[artifact] !== expected) throw new Error('Electron checksum pin mismatch: ' + artifact);"
      - name: Install Electron runtime
        timeout-minutes: 10
        env:
          ELECTRON_MIRROR: {{ELECTRON_MIRROR}}
        run: |
          unset electron_use_remote_checksums npm_config_electron_use_remote_checksums
          node node_modules/electron/install.js
      - name: Rebuild native modules for Electron ABI
        run: |
          {{ELECTRON_REBUILD_CMD}}
      - name: Unit tests (Vitest, single-worker deterministic)
        run: |
          timeout --signal=TERM --kill-after=30s 20m \
            {{VITEST_CMD}} -- --maxWorkers=1 --no-file-parallelism --reporter=verbose
      - name: Vitest failure diagnostics
        if: failure()
        run: |
          echo "Vitest 或前置步骤失败，输出 runner 进程树"
          ps -eo pid,ppid,stat,etimes,pcpu,pmem,cmd --forest
      - name: Electron smoke test (xvfb)
        run: |
          cd {{DESKTOP_WORKSPACE_DIR}}
          set +e
          timeout 30 xvfb-run --auto-servernum npx electron . --no-sandbox --disable-gpu 2>&1
          status=$?
          set -e
          if [ "$status" -eq 124 ]; then
            echo "Electron remained alive for the smoke window"
          elif [ "$status" -eq 0 ]; then
            echo "Electron exited before the smoke window completed"
            exit 1
          else
            exit "$status"
          fi
