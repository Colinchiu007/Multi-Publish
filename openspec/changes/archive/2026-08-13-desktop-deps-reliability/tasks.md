# Tasks — desktop-deps-reliability

## Task 1: OpenSpec 工件齐备
- [x] proposal.md / design.md / specs 3 需求 / 本 tasks.md
- 验证：`openspec validate --change desktop-deps-reliability` 通过

## Task 2: CCG 任务登记
- [x] `.ccg/tasks/fix-desktop-deps-reliability/task.json`（openspecChange 关联）+ requirements.md
- 验证：task.json 存在且字段完整

## Task 3: TDD 实现自愈脚本（先测试后实现）
- [x] 测试 `scripts/ensure-desktop-deps.test.js`：清单解析/缺失判定/恢复命令构造/缓存失效逻辑
- [x] 实现 `scripts/ensure-desktop-deps.js`（--check / --restore / --invalidate-vite-cache）
- 验证：`node --test scripts/ensure-desktop-deps.test.js` 全绿；健康树 `--check` exit 0；模拟缺失 tinycolor → restore → require OK

## Task 4: remotion 版本精确 pin
- [x] root package.json：`"remotion": "^4.0.484"` → `"4.0.484"`
- [x] packages/remotion-composer/package.json：6 个 `@remotion/*` + `remotion` 全部 `^4.0.484` → `4.0.484`
- 验证：`npm install --package-lock-only --ignore-scripts` exit 0（无 ETARGET）；lockfile 中 renderer 仍 4.0.484

## Task 5: 门禁验证
- [x] node --test 绿；npm 解析验证；脚本自检
- [x] 双模型审查或降级记录（antigravity/claude 不可用时 codex 独立审查 + 主代理 6 项自检）
- 验证：`.quality-gates.md` 记录表 + CHANGELOG + 01-docs/learnings.md 复盘

## Task 6b: 启动契约封装（start-desktop.ps1）
- [x] scripts/start-desktop.ps1：定工作区/同步/端口归属 fail-closed/清旧实例/依赖健康/证据输出
- [x] 提交（分支）→ push → PR #714 → remoteStatus 记录（CI pending）
- [x] PR 合并后三同步归档：openspec archive + .ccg archive + learnings 复盘（同一 commit）
- 验证：`scripts/openspec-sync-check.js` 无未归档警告（合并后）






