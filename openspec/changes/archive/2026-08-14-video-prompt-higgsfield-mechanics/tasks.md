## 1. 契约层常量与字段收敛

- [x] 1.1 `VIDEO_ENGINE_LIMITS` 新增上限：excludedCharactersMax=10、noSwapPairsMax=5、shotsMax=3、beatsPerShotMax=6、beatTimeMax=40、beatActionMax=500、shotDurationMax=15（clamp 语义）、videoMaxLengthMax=20000、videoMaxLengthRefinedDefault=5000（测试：`video-prompt-engine-contract.test.js` 断言常量存在且为数值）
- [x] 1.2 `normalizeVideoMeta` 收敛 `excluded_characters`（字符串按 `[\n;,]+` split 与数组双兼容 → trim 去空白 → 大小写敏感精确去重保留首次序 → ≤10 截断，非法输入丢弃）——测试：数组收敛 / 字符串输入 / 对象非法 / 大小写敏感去重（`["JAX"," jax "]` → `["JAX","jax"]`）
- [x] 1.3 `normalizeVideoMeta` 收敛 `no_swap_pairs`（恰含 2 个非空字符串的二元组；任一元素非法整对丢弃；≤5 截断）——测试：合法对 / `["ROKO",123]` 与 `["ROKO"]` 整对丢弃 / 超限截断
- [x] 1.4 `normalizeVideoMeta` 收敛 `color_ratio`（格式 `^\d{1,3}(:\d{1,3}){2}$`；"abc"/"60:30:10:5"/"0:30:10" 丢弃；缺失不填充默认）——测试：合法透传 / 三种非法丢弃 / 缺失无默认
- [x] 1.5 `normalizeVideoMeta` 收敛 `shots[]`（先过滤非法切再取前 3，非法切不占位；shot/camera 非空 ≤50；duration 必填正数 ≤15 超限 clamp，非有限/≤0 整切丢弃；beats 必为数组，先丢弃非法项（time/action 任一为空/非对象元素）再取前 6，time/action 超限 slice 截断；单切任一子字段非法整切丢弃；全非法 `shots` 不输出）——测试：2 切通过 / 5 切截断 / 非法切不占位（6 切第 2 非法→保留 [1,3,4]）/ duration 20 clamp / duration 'abc'/0/-1 整切丢 / beats 非对象元素丢 / 空 action 先丢后截 / 单切局部非法整切丢 / 全非法无键
- [x] 1.6 零回归断言：无新字段时 `normalizeVideoMeta` 输出与改动前逐键一致——测试：既有 8 字段用例全部保持通过

## 2. 收尾参数行与平台画像

- [x] 2.1 新增 `PLATFORM_VIDEO_PROFILES` 常量（seedance: duration 15/aspect 21:9/resolution 1080p/audio true；generic: duration 15/aspect 16:9/resolution 1080p/audio false；四键齐备）——测试：seedance 与未登记平台回退
- [x] 2.2 实现纯函数 `appendVideoTrailer(prompt, options)`（`Photoreal. NON-IP. {aspect}. {duration}s. {audio} only.` 模板；options 可覆盖 aspect/duration/audio/nonIp；已含 "NON-IP" 幂等跳过；超长时仅保留能完整放入预算的模板段（保留 NON-IP 段）并**末段去句点收尾**（保证以 `NON-IP` 结尾；评审后对齐实现，替代「再 pop 一段」的初版表述）——测试：默认追加 / 幂等 / 原字符串不可变 / 超长截断保 NON-IP 且不以 `\d+s.` 结尾
- [x] 2.3 `module.exports` 导出新函数与常量（不改变既有导出签名）——测试：导出存在性

## 3. 结构完整性 fail-closed 校验与 max_length 层级语义

- [x] 3.1 `extractOptimizedVideoPrompt` 增加校验：`video.excluded_characters` 或 `video.no_swap_pairs` 非空时，基于**截断前** `optimized_prompt` 校验含 `<<<` 或 `[ABSENT]`（大小写敏感），否则 `{ ok: false, error }`（错误信息含字段名）——测试：声明但正文无标记失败（含仅声明 no_swap_pairs 场景）/ 正文含 `[ABSENT]` 通过 / 未声明零回归
- [x] 3.2 超长截断不误杀：构造"标记在 prompt 尾部且 maxLength 截断会削掉"的用例，断言校验基于截断前文本通过、最终 prompt 仍被截断——测试：`{ ok: true }` 且返回 prompt 长度 ≤ maxLength
- [x] 3.3 校验标记集抽为常量（后续可扩展）——测试：常量导出
- [x] 3.4 双 builder 增加精修层 max_length 能力门控语义（实现前评审 C1/C2 修正）：`creative_level ≥ 7` 且未显式传时使用精修层默认 5000 并收敛到后端能力上限（8013 `buildVideoOptimizeRequest` → 2000；8020 `buildStandaloneVideoOptimizeRequest` → 4000）；`< 7` 保持 500；显式传值始终优先并在能力范围收敛；`null`/空串/**纯空白串**视为未显式传（实现后评审 W1 对齐 spec R6）——测试：8013 level 8 → 2000 / 8020 level 8 → 4000 / level 5 双后端保持 500 / 8013 显式 1500 优先 / 8013 显式 3000 → 2000 / 8020 显式 99999 → 4000 / null、空串与纯空白视为未显式传
- [x] 3.5 修复 8020 显式 min 边界（评审 W1）：`buildStandaloneVideoOptimizeRequest` 显式 max_length 收敛范围由 [50, 2000] 改为 [200, 4000]（8020 `ge=200`，旧 50 必 422）——测试：既有 `maxLength:10 → 50` 断言修正为 → 200

## 4. 测试回归与质量门禁

- [x] 4.1 运行 `apps/desktop` 契约测试套件（`video-prompt-engine-contract.test.js` 全量 + 关联故事线）全部通过，含评审修正后的 R6 能力门控断言（3.4/3.5）与 M1-M4 边界用例（1.5）；新增分支覆盖率 ≥90%
- [x] 4.2 打包验证（QM-1/QM-2）：`npx electron-builder --win --x64` 通过；打包/未打包状态契约行为一致（trailer 未启用时零输出差异；max_length 上浮仅精修层生效）
- [x] 4.3 更新 CHANGELOG.md、01-docs/learnings.md（Higgsfield 机制落地记录）、v2.0 分析报告落地状态附录；`.quality-gates.md` 执行记录
- [ ] 4.4 外部联调验收项（跨仓库，prompt-engine 另建 change 后执行）：(a) 真实 8020 返回含新字段（excluded_characters/no_swap_pairs/color_ratio=60:30:10/shots[]）→ 契约层全部通过；(b) evaluator 精修层长模板（>1000 词）不再因长度硬扣（注意：8013 `prompt_engine/evaluator.py` 与 8020 `video_prompt_engine/evaluator.py` 均有 100-400 词判据，两处都要做层级感知修复）；(c) evaluator 规则违规扣分生效（缺席角色出现在正文 / 无收尾参数行等违规项正确扣分）；(d) 引擎侧模型边界抬高（8013 le≥2000 或视频域专用字段、8020 le≥5000）后，契约层精修层默认自动上浮至 5000——部署顺序约束（评审 M5）：**契约层先行**，引擎侧输出新字段与契约校验同步或之后上线，避免引擎先行导致合法响应被 fail-closed 误杀——本任务在 prompt-engine change 就绪前保持未勾选
