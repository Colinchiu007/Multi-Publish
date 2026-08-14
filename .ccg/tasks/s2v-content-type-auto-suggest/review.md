# Review — s2v-content-type-auto-suggest（方案 1）

- 审查方式：双模型交叉验证（CCG 要求）。antigravity 地域不可用（Eligibility check failed: not available in your location）→ 按降级规则改为主代理审查 + Claude 审查（codeagent-wrapper，session 71588003-979a-4edd-b994-98665e619aad）。
- 审查对象：git diff origin/main（不含 locale-cjk-baseline.json，行号吸收 1515→1515）。
- 审查时基线：story-context-engine 44 条 / CreateView 192 条 / 权限 49 条，QM-1 打包通过。

## Critical（已修复 + 回归测试）

1. **CreateView.vue suggestS2VContentType：seq 令牌在空文本分支不递增 → 清空文案后在途 history 响应仍回写**
   - 原实现 seq 仅在发请求时递增；清空文本走 `!text` 提前返回不递增，在途响应 `seq===seq` 成立 → 空文本态被写 history，且经 deep watcher 落入 lastOptions 跨会话粘性。
   - 修复：seq 无条件递增（先于一切守卫）+ await 后复核当前文本与范围守卫（流水线/inputMode）。
   - 回归测试：`清空文本时在途 history 响应被丢弃`、`在途响应到达时已切出 text 输入模式 → 不写回`（CreateView.test.js 新增 2 条）。

## Warning（接受为设计语义，记录）

1. **原生 select @change 在重选当前值时（如默认 general 再点 general）不触发 → touched 不置位**：影响面小（需用户主动打开下拉确认同值），MVP 由「可见可改」兜底；如产品需要可改 @focus 语义，登记为后续项。
2. **系统预选值经 deep watcher 持久化，restore 时按「用户偏好」置 touched → 预选为一次性语义**：与 design.md D3「恢复值视为用户偏好」一致；系统建议可见可改，用户未改即视为接受。产品语义确认后如需「每次强信号重新预选」再引入来源分离持久化。

## Info（已评估，不阻塞）

- `dynasty.evidence.slice(0,5)` 与引擎已有切片重复：保留作为 IPC 响应契约的显式上限，无副作用。
- publisher.js fail-open fallback 携带 data：渲染端 code!==0 一律 no-op，data 冗余但无害。
- story2video.js handler 内 require story-context-engine：延迟加载避免无关通道触发引擎加载，与文件顶部集中 require 风格略有出入，接受。
- 「三国杀游戏攻略」误报：design.md D4 已钉住，可见可改兜底。
- PUBLIC_CHANNELS ↔ PUBLIC_METHODS 无自动 parity 断言：既有架构问题（本次双侧登记 + 单边测试已覆盖），登记为后续 CI 改进。

## 结论

APPROVE（修复 Critical #1 后）。主代理复查 diff 与 Claude 结论一致：fail-open 闭环、权限双登记、IPC 参数三段契约、守卫分层、e2e 桩默认 no_signal、测试隔离均正确。
