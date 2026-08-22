# 质量节拍审查报告

## 变更

- `word_split.good_lead` 三端同步增加 `成`，并新增受约束的 `semantic_lead`（`提/还/把/绝`）。
- `wordSafeSplit` / `_word_safe_split` 先选择后块语义引导字切点，再回退到普通尾部收束切点。
- `mergeShort` 与硬切尾块平衡跳过语义引导后块，避免“提前谈妥了”“还搞屠城”等完整短语被回吸。
- 用户样例向量和 Electron 精确断言锁定 6 块语义输出，并补充完整用户文案向量。

## 审查结论

- Critical: 0
- Warning: 0
- Info: 新规则是启发式，可能改变少量无标点长句的候选切点；已由 TS/JS parity、共享向量和 sidecar 定向测试覆盖。
- 外部审查：Claude wrapper 退出码 1；opencode wrapper 未返回可用报告，按仓库降级流程执行本地逐项审查。

## 本地检查

- TS story2video-engine：157 passed。
- Electron 字幕合同、向量、parity：134 passed（使用 `apps/desktop/vitest.config.js`；首次未带配置的裸调用产生 `describe is not defined`，未计入算法结果）。
- sidecar Python 字幕向量、场景字幕与导出器：168 passed（仅既存 `jieba/pkg_resources` 警告）。
- 完整用户文案已真实调用 Electron JS 与 Python sidecar 入口，均输出 39 块；机器比较逐块相等，拼接后的非换行字符完整覆盖。
- TypeScript `tsc --noEmit`、Electron `node --check`、`git diff --check`、`node scripts/verify-worktree-deps.js` 均通过。
- OpenSpec：`openspec validate subtitle-semantic-split-fix --strict` 通过。
- QM-1：`pnpm exec electron-builder --win --dir --publish never` 退出码 0；asar 清单包含 Electron 分句镜像和共享规则，构建生成的 preload bundle 已精确恢复。
- 外部审查：Claude wrapper 退出码 1；opencode wrapper 未返回可用报告，按仓库降级流程执行本地逐项审查。

## 最终复核（2026-08-22）

- 本轮实际回归：TS 139 passed；Electron 136 passed；smart-sentence-splitter Python 全量 519 passed、9 skipped、2 warnings。
- 完整用户长文由 Electron JS 与 Python sidecar 真实入口分别执行，均得到 39 块，逐块比较一致。
- `pnpm exec electron-builder --win --x64 --publish never` 退出码 0，生成 `dist-electron/Multi-Publish.Setup.2.3.53.exe`。
- ASAR 清单确认包含 `story2video-segmentation-engine.js`、`text-segmentation.ts` 与 `subtitle-rules`；构建生成的 preload bundle 未进入最终 diff。
- 以上数字覆盖并更新本报告前面早期的定向测试统计。
