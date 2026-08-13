## 1. 契约层常量与字段收敛

- [ ] 1.1 `VIDEO_ENGINE_LIMITS` 新增上限：excludedCharactersMax=10、noSwapPairsMax=5、shotsMax=3、beatsPerShotMax=6、beatTimeMax=40、beatActionMax=500、shotDurationMax=15（clamp 语义）、videoMaxLengthMax=20000、videoMaxLengthRefinedDefault=5000（测试：`video-prompt-engine-contract.test.js` 断言常量存在且为数值）
- [ ] 1.2 `normalizeVideoMeta` 收敛 `excluded_characters`（字符串按 `[\n;,]+` split 与数组双兼容 → trim 去空白 → 大小写敏感精确去重保留首次序 → ≤10 截断，非法输入丢弃）——测试：数组收敛 / 字符串输入 / 对象非法 / 大小写敏感去重（`["JAX"," jax "]` → `["JAX","jax"]`）
- [ ] 1.3 `normalizeVideoMeta` 收敛 `no_swap_pairs`（恰含 2 个非空字符串的二元组；任一元素非法整对丢弃；≤5 截断）——测试：合法对 / `["ROKO",123]` 与 `["ROKO"]` 整对丢弃 / 超限截断
- [ ] 1.4 `normalizeVideoMeta` 收敛 `color_ratio`（格式 `^\d{1,3}(:\d{1,3}){2}$`；"abc"/"60:30:10:5"/"0:30:10" 丢弃；缺失不填充默认）——测试：合法透传 / 三种非法丢弃 / 缺失无默认
- [ ] 1.5 `normalizeVideoMeta` 收敛 `shots[]`（≤3 切；shot/camera 非空 ≤50；duration 必填正数 ≤15 超限 clamp；beats 先丢弃非法（time/action 任一空）再取前 6；单切任一子字段非法整切丢弃；全非法 `shots` 不输出）——测试：2 切通过 / 5 切截断 / duration 20 clamp / 空 action 先丢后截 / 单切局部非法整切丢 / 全非法无键
- [ ] 1.6 零回归断言：无新字段时 `normalizeVideoMeta` 输出与改动前逐键一致——测试：既有 8 字段用例全部保持通过

## 2. 收尾参数行与平台画像

- [ ] 2.1 新增 `PLATFORM_VIDEO_PROFILES` 常量（seedance: duration 15/aspect 21:9/resolution 1080p/audio true；generic: duration 15/aspect 16:9/resolution 1080p/audio false；四键齐备）——测试：seedance 与未登记平台回退
- [ ] 2.2 实现纯函数 `appendVideoTrailer(prompt, options)`（`Photoreal. NON-IP. {aspect}. {duration}s. {audio} only.` 模板；options 可覆盖 aspect/duration/audio/nonIp；已含 "NON-IP" 幂等跳过；超长时按模板段从尾部截断但保留 NON-IP 段）——测试：默认追加 / 幂等 / 原字符串不可变 / 超长截断保 NON-IP（无孤立 `{duration}s.` 残缺段）
- [ ] 2.3 `module.exports` 导出新函数与常量（不改变既有导出签名）——测试：导出存在性

## 3. 结构完整性 fail-closed 校验与 max_length 层级语义

- [ ] 3.1 `extractOptimizedVideoPrompt` 增加校验：`video.excluded_characters` 或 `video.no_swap_pairs` 非空时，基于**截断前** `optimized_prompt` 校验含 `<<<` 或 `[ABSENT]`（大小写敏感），否则 `{ ok: false, error }`（错误信息含字段名）——测试：声明但正文无标记失败（含仅声明 no_swap_pairs 场景）/ 正文含 `[ABSENT]` 通过 / 未声明零回归
- [ ] 3.2 超长截断不误杀：构造"标记在 prompt 尾部且 maxLength 截断会削掉"的用例，断言校验基于截断前文本通过、最终 prompt 仍被截断——测试：`{ ok: true }` 且返回 prompt 长度 ≤ maxLength
- [ ] 3.3 校验标记集抽为常量（后续可扩展）——测试：常量导出
- [ ] 3.4 `buildVideoOptimizeRequest` 增加精修层 max_length 语义：`creative_level ≥ 7` 且调用方未显式传 `max_length` 时默认 5000（clamp ≤20000）；`< 7` 保持 500——测试：level 8 默认 5000 / level 5 保持 500 / level 9 显式 3000 优先 / 显式 99999 收敛 20000

## 4. 测试回归与质量门禁

- [ ] 4.1 运行 `apps/desktop` 契约测试套件（`video-prompt-engine-contract.test.js` 全量 + 关联故事线）全部通过；新增分支覆盖率 ≥90%
- [ ] 4.2 打包验证（QM-1/QM-2）：`npx electron-builder --win --x64` 通过；打包/未打包状态契约行为一致（trailer 未启用时零输出差异；max_length 上浮仅精修层生效）
- [ ] 4.3 更新 CHANGELOG.md、01-docs/learnings.md（Higgsfield 机制落地记录）、v2.0 分析报告落地状态附录；`.quality-gates.md` 执行记录
- [ ] 4.4 外部联调验收项（跨仓库，prompt-engine 另建 change 后执行）：(a) 真实 8020 返回含新字段（excluded_characters/no_swap_pairs/color_ratio=60:30:10/shots[]）→ 契约层全部通过；(b) evaluator 精修层长模板（>1000 词）不再因长度硬扣；(c) evaluator 规则违规扣分生效（缺席角色出现在正文 / 无收尾参数行等违规项正确扣分）——本任务在 prompt-engine change 就绪前保持未勾选
