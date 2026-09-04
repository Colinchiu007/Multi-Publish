# requirements.md — 修复 main CI 既有失败

## 需求
用户选择方案 1：修复 main 上既有 CI 失败，走新分支 codex/fix-main-ci-regressions，按质量节拍交付并合并，把 main 的 CI 恢复绿色。

## 现状取证（基线 origin/main@1fe02e74，2026-08-12）
- 失败工作流：electron-tests、QG Coverage、QG Desktop Shards (1/2)、build (windows-latest) + handle-ci-failure 自动处理失败。
- 同一批失败在 9a028b2b（#534）已存在 → 既有回归，非 #535 引入（先归因后动手）。

## 根因
1. CreateViewHistory.vue 模板在 §7.1.33 统一按钮为 s2v-btn-*（video-creation-buttons.css），CreateView.test.js 4 处仍断言 .history-btn.* → 3 用例失败。
2. build.yml Startup smoke 在 npm ci 后直接 test:startup；electron@43 无 postinstall，首次 require(electron) 链触发二进制下载超 10s hookTimeout → Windows 冷 runner 失败。

## 修复
1. CreateView.test.js：.history-btn.open/.resume → .history-item .s2v-btn-secondary/.s2v-btn-resume（4 处，含负向用例）。
2. build.yml：Startup smoke 前新增 node scripts/ensure-electron.js。
3. vitest.smoke.config.js：hookTimeout: 30000（注释注明回归）。

## 验证
- CreateView.test.js 131/131；npm run test:startup 12/12；build.yml YAML 解析通过；全量 desktop 串行套件。
