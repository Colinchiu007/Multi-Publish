# Review — film-engineering-hell-grind

## 双模型审查降级说明（机制记录）

按 CCG 契约，M+ 复杂度分析与审查应双模型并行（antigravity + Claude）。本次执行时实测降级为主代理自审，原因：

1. **antigravity 后端**：`Eligibility check failed: not available in your location`（地区不可用）。
2. **Claude CLI**：`Not logged in · Please run /login`（`claude -p` 实测未登录）。
3. **子代理探测**：`http://127.0.0.1:57321/v1/responses` 返回 403（后端不可用），已按机制降级。

主代理自审替代覆盖：接线链路（container.setup / ipc-handlers / license-access-control 10 通道 / preload / router / CreateView 入口 / pipeline-labels）、fetch-hell-grind-kit.py 全量阅读、composable 真实数据路径测试、渲染端 79 个 `filmEngineering.*` 引用键与 locales 全量核对。

## 审查结论

- 🔴 **Critical: 0** — 已修复：i18n `filmEngineering` 包装键缺失（曾扁平插入 locales 顶层导致 UI 渲染键名）；PIPELINES 缺 film-engineering 条目（已补）；visual 门禁缺 film-engineering 用例（已补）。
- 🟠 **Warning: 0**
- 🟢 **Info: 1** — `fetch-hell-grind-kit.py` 中 PIL 缩略图失败回退 raw 字节时，输出文件可能不是 webp 编码（仅影响重建脚本，不影响已入库资产；重建时由 kit-loader 的 fail-closed 校验兜底）。

## 验证记录

- 定向测试：pipeline-engine 39/39、CreateView + i18n 206+11、visual-view-runner、all-views visual 27/27（对 worktree 自身 dev server）。
- QM-1：`electron-builder --win --dir` exit 0；asar 含 film-kit 19 文件（10 webp）；extractAll 后 `loadFilmKit` OK（153 shots / 162 scenes）。
- 契约：script-adapt 与 kit shot 同构、generate-selected 可消费；fail-closed 用例覆盖缺文件/坏 JSON/schema 非法/token 格式错。
