# Tasks — video-content-fidelity

## 1. S2 文案段落化（前置依赖）
- [x] 1.1 新建 `apps/desktop/electron/services/video-script-segmentation.js`：空行/句号两级切分，输出 `{paragraphs:[{index,text,sentences[]}], truncated}`，纯函数、可测试
- [x] 1.2 新建 `video-script-segmentation.test.js`：多段/单段退化/超长截断/空输入用例

## 2. S1 CONCEPT/STORYBOARD 双模式（依赖 1）
- [x] 2.1 `videogen-stages.js` 新增模式判定函数 `resolveStoryboardMode(text, explicit)`：auto 规则（段落≥3 或字≥300 或句≥8 → fidelity；字≤80 且句≤2 → creative；其余 hybrid），显式参数优先，非法归一化
- [x] 2.2 `buildConceptPrompt` 按模式返回不同 system prompt：creative 保留现状；fidelity/hybrid 加硬保真约束 + 输出 key_facts/entities/mode
- [x] 2.3 `buildStoryboardPrompt` 支持注入分段文案全文 + key_facts/entities + source_paras 绑定（fidelity/hybrid）；creative 维持现状
- [x] 2.4 CONCEPT executor：按模式解析 key_facts/entities/mode；fidelity/hybrid 缺失 key_facts/entities 时重试一次
- [x] 2.5 STORYBOARD executor：fidelity/hybrid 先段落化再构图，场景保留 source_paras；模式与段落注入日志
- [x] 2.6 `videogen-stages.test.js`：模式判定各档位、prompt 内容断言（保真约束注入/creative 无约束）、source_paras 透传

## 3. S3 内容对齐门禁（依赖 2）
- [x] 3.1 新建 `apps/desktop/electron/services/video-content-alignment.js`：extractKeyEntities（内置词典 + LLM 兜底桩）、checkSceneAlignment(scenes, entities, minCoverage)、assessVisualConsistency 桩（返回 not_implemented）
- [x] 3.2 STORYBOARD 后置对齐校验：不达标带 missing 重试（maxRetries=2），仍不达标 fail closed；空场景 fail closed
- [x] 3.3 新建 `video-content-alignment.test.js`：覆盖率达标/不足重试/空场景 fail closed/门禁 disabled 仍出报告

## 4. S4a context 透传（依赖 2）
- [x] 4.1 `video-prompt-engine-contract.js` buildVideoOptimizeRequest 增加 context 白名单透传（synopsis/character/setting/character_list/full_text）+ 长度收敛 + 敏感键拦截
- [x] 4.2 videogen GENERATE 批量优化请求附 context（full_text 分段摘要、synopsis/character 来自 CONCEPT）
- [x] 4.3 `video-prompt-engine-contract.test.js`：context 透传/越界收敛/敏感键剥离用例

## 5. S4b prompt-engine 事实保真（prompt-engine 仓库）
- [x] 5.1 `strategies/video/generic.py` system prompt 增加事实保真指令（主体/时代/事件不变）+ context.synopsis 事实锚点引用
- [x] 5.2 `tests/test_video_optimize.py` 增加：中文历史事实保留、context 锚点一致、未知 context 键忽略（服务端）

## 6. S5 对齐评估报告
- [x] 6.1 GENERATE 完成后把 alignmentReport（mode/coverage/matched/missing/retries/truncated）写入 run 上下文 `context.videoContentFidelity` 与日志
- [x] 6.2 视觉评估接口返回 `{status:'not_implemented'}`，文档标注未来工作
- [x] 6.3 `videogen-stages.test.js`：报告字段断言

## 7. 配置与文档
- [x] 7.1 story2video-text-config 增加 videoContentFidelity 配置归一化（enabled/minCoverage/maxRetries/llmExtractFallback/maxFullTextChars）+ 测试
- [x] 7.2 新建 `01-docs/PRD-video-content-fidelity.md`（详细：流程/数据校验/功能逻辑/交互/显示项/提示文字/验收）
- [x] 7.3 新建 `01-docs/ARCH-video-content-fidelity.md`（模块/数据流/JSON schema/错误码/测试策略）
- [x] 7.4 更新 `01-docs/PRD.md` §7.1（视频提示词批量契约补 content fidelity 上下文）、`PRD-video-creation.md` §3.1.2（双模式分镜/对齐门禁）、CHANGELOG.md

## 8. 测试与质量门禁
- [x] 8.1 运行 videogen 相关单测（videogen-stages、video-content-alignment、video-script-segmentation、contract、text-config）
- [x] 8.2 运行 prompt-engine tests/test_video_optimize.py + test_batch.py
- [x] 8.3 `.quality-gates.md` 自检 + 双模型/降级审查记录

## 9. 交付
- [x] 9.1 Multi-Publish 推送 codex/video-content-fidelity → PR → CI → 合并
- [x] 9.2 prompt-engine 推送 → PR → CI → 合并
- [x] 9.3 openspec apply + 三同步归档（archive + ccg archive + learnings）
- [x] 9.4 更新记忆（extensions/ad_hoc/notes）
