# Review: story2video-bgm-notice (Claude 独立审查)

- 后端：claude（codeagent-wrapper）；antigravity 降级（agy 缺失，2026-08-10 记录）。
- 结论：**Critical 0**。

## 合入前已修复（审查发现）

- Major1 惰性 GC 无环境门控（测试会真实删除临时目录）→ `maybeRunLazyImportedMediaGc` 仅 `gcEnabled === true` 触发；生产导入路径（story2video:import-media）传 `gcEnabled: true`；测试不传零副作用。
- Major2 惰性 GC 可能删除运行中 compose 正在混音的 BGM → 混音前 `resolveReadableMediaFile` 复核，失效则降级（bgmSkipped=true/unreadable/bgmPath=null）而非硬失败。
- Major3 提示条「看不见窗口」（完成即跳结果页）→ `applyOrchestrationOutcome` 透传 `bgmSkipped/bgmReason` 到结果页 query；ResultView 显示同一 i18n 提示（testid story2video-result-bgm-skipped-notice）。
- Minor4 `Number(null)=0` 每次触发 → 显式 `!== undefined/null` 守卫。
- Minor5 GC 在校验前执行/死 try-catch → 移到源文件校验通过后、复制前；去 try-catch。
- Minor6 `context.compose` 与 `{data}` 包裹兼容 → computed 用 `compose.data || compose`。
- Minor8 关闭按钮 aria-label 硬编码中文 → `translateWithLocaleFallback`。

## 记录为后续项（不阻塞）

- Minor7 引擎 `BGM_SKIP_WARNING_MESSAGES` 与前端 `BGM_SKIP_REASON_TEXT` 双份映射；已注释「renderer 应依 bgmSkippedReason 本地化，warnings 为调试兜底」，后续可收敛为单一来源。
- Minor9 `_lastImportedMediaGcByBaseDir` 为模块级 Map；生产仅单 baseDir 场景成立，注释已说明。
- 测试覆盖：ResultView 提示条正反例、compose 混音期降级、惰性 GC 门控/节流均已补。
