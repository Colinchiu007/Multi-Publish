# Tasks

## 1. kernel 回收：领域中立函数（prompt-engine-kernel.js）
- [ ] 1.1 `resolveTieredMaxLength(explicit, creativeLevel, range, batchDefault)`：从视频 `_resolveVideoMaxLength` 泛化（签名带 range），视频契约改引用（行为零变化验证：视频 93 测试全绿）
- [ ] 1.2 `filterPlausibleNegativePrompt(userNegative)`：类别白名单（身份漂移/服装漂移/重复主体/解剖错误/多余肢体/多余手指/意外文字/水印/风格漂移）+ 裸绝对否定词清理；内置 no-text 合并逻辑保持
- [ ] 1.3 `normalizePositiveConstraints(value)`：数组透传/字符串按 [\n;]+ 拆分/上限 10/非字符串元素丢弃（与视频同防御模式），视频 `normalizeVideoMeta` 改引用
- [ ] 1.4 `scorePrompt(prompt, opts)`：长度（100-400 词英文/中文长度档）+ 六要素 + 保真 + 构图四维评分（复用视频 evaluate 结构，构图关键词替代镜头字段）
- [ ] 1.5 kernel 测试：新增用例（层级长度边界/plausible-only 过滤/正向约束收敛/评分维度），既有 kernel 测试零回归

## 2. 图片契约扩展（prompt-engine-contract.js）
- [ ] 2.1 context 白名单扩展：buildPromptEngineOptimizeRequest 接受 synopsis/character/setting/character_list，未知键忽略 + warning（复用 kernel assertNoSensitiveContext）
- [ ] 2.2 `extractOptimizedPrompt` meta 透传 positive_constraints（kernel normalizePositiveConstraints）
- [ ] 2.3 `IMAGE_QUALITY_BASELINE` 常量（≤200 字符：写实摄影/自然光/色彩 60:30:10/皮肤细节/物理/禁文字段）+ 默认注入（options.quality_baseline=false 可关）+ 受 maxLength 截断保护
- [ ] 2.4 `selectBestCandidate(candidates, sourcePrompt)`：kernel scorePrompt 择优，tie-break 最长
- [ ] 2.5 图片契约测试：新增 12+ 例（meta 透传/缺省零回归/白名单/敏感键/基线开关/择优），既有 157 行契约全量零回归

## 3. 调用方接入（最小侵入）
- [ ] 3.1 多候选路径（disturb_and_optimize 或等价桌面侧路径）接入 selectBestCandidate（评估择优启用开关默认 on，关闭零回归）
- [ ] 3.2 契约测试：OPTIMIZE_BATCH 内容合同回归（非空校验不变）

## 4. 验证与交付
- [ ] 4.1 全量受影响测试：prompt-engine-kernel.test.js + prompt-engine-contract.test.js + video-prompt-engine-contract.test.js（视频改引用后零回归）+ 关联套件
- [ ] 4.2 openspec validate --strict 通过；双模型评审（antigravity 不可用降级记录 + Claude）
- [ ] 4.3 CHANGELOG + .quality-gates.md + CCG task 同步
- [ ] 4.4 PR → CI 全绿 → 合并 → 三同步归档（openspec archive + task archive + learnings）

## 5. 后续（另行 change，不在本 tasks 完成判定）
- [ ] 5.1 外部引擎 8013 图片策略 system prompt 增强（事实保真/正负向分块/EXACT N 角色）——P1
- [ ] 5.2 图片结构化 JSON 输出（6 要素 + positive_constraints）——P1
