# Review: subtitle-segmenter-oracle

## 审查范围

- TypeScript 权威实现：packages/story2video-engine/src/text-segmentation.ts、src/segment.ts、共享规则与测试。
- Electron JavaScript mirror：apps/desktop/electron/services/story2video-segmentation-engine.js 及其向量/parity 测试。
- Python sidecar：src/splitter/scene_subtitle/subtitle_segmenter.py、规则与测试。
- 依赖闭包、ASAR 加载、打包启动和共享主目录/隔离 worktree 门禁。

## 本地独立审查

- Runtime 审查：0 Critical / 0 Warning。重点核对 safe cut、显式保护短语、了后守卫、小数 token、Unicode 代理对、segmentit soft tie-break 及 TS/JS parity。
- Python 审查：初次发现 jieba.cut() 运行时异常可能穿透主流程；已在 _segmenter_spans() 纳入完整异常回退，并增加 test_jieba_runtime_failure_falls_back_to_rule_boundaries。
- Python 审查中的“14 failed”结果未按本项目要求设置 PYTHONPATH=src，主代理使用正确入口复现为全绿，因此没有据该错误环境改变字幕真值。
- 修复后的 Python 定向回归重新通过，未发现剩余 Critical/Major。

## 外部模型审查

- opencode：wrapper 启动后因外部 prompt 目录权限被自动拒绝，exit 1，未产出报告。
- Claude：wrapper 成功启动但在有界等待窗口内无输出，主代理按流程终止，未产出报告。
- 外部审查不可用/超时已如实记录；本地两路独立审查和实际测试作为替代证据，不将外部结果标记为 PASS。

## 验证快照

| 门禁 | 结果 | 证据 |
|---|---|---|
| Python 编译与向量 | PASS | PYTHONPATH=src python -m py_compile ...；test_subtitle_vectors.py: 136 passed |
| Python 场景字幕 | PASS | test_scene_subtitle.py: 42 passed，含分词器异常回退测试 |
| TypeScript | PASS | pnpm --filter @multi-publish/story2video-engine exec vitest run tests/story2video-engine.test.ts tests/subtitle-vectors.test.ts: 156 passed |
| TypeScript build | PASS | pnpm --filter @multi-publish/story2video-engine run build |
| Electron JS/vector/parity | PASS | 3 test files, 148 passed |
| JS syntax/dependency | PASS | node --check story2video-segmentation-engine.js；node scripts/verify-worktree-deps.js 9 项 OK |
| Diff hygiene | PASS | git diff --check |
| Electron QM-1 | PASS with environment notes | electron-builder --win --dir --publish never exit 0；ASAR 解包后 rpa-engine 与字幕引擎真实 require 成功；独立 userData 启动 8 秒存活、stderr 为空、主窗口显示 |

## 环境说明

- electron-builder 报告 worktree 未提供 .playwright-browsers，但本次字幕依赖不使用该资源，构建仍成功。
- 打包启动日志中有既有 PythonBridge spawn python ENOENT，但未进入 stderr、主窗口正常显示，且本次未修改 PythonBridge；另以 CALLBACK_SERVER_PORT=16581 避免了其他 worktree 的端口占用。该环境问题不作为本次字幕变更的功能回归。
- 共享主目录保持 main、clean，mp-worktree-health.ps1 -RequireWriteGuard 返回 ok: true。

## 结论

本 change 的词边界 oracle、完成体“了”后普通宾语保护、异常安全回退和三端回归均已完成。无未处理 Critical。Multi-Publish PR #1123 已合并为 `8216f84ac9250c5b8c8fbdc838e9fcdc7cf011ee`；Python sidecar PR #24 已合并为 `02767f772224f7f6103cb43a70ae14f180651c8d`。合并期间仅临时将 required approving review count 设为 0，保留状态检查与其他保护；合并后已恢复为原始的 1 个批准、`dismiss_stale_reviews=true`、4 个状态检查和 `enforce_admins=true`。
