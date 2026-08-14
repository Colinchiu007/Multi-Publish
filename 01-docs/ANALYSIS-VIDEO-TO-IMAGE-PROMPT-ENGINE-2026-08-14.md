# 视频提示词引擎机制 → 图片提示词引擎迁移分析报告

> **版本**: v1.0（2026-08-14）
> **状态**: 分析完成，待作为图片引擎 P0（共享内核 + 领域分离重构）输入
> **背景**: Higgsfield《Hell Grind》开源档案（115,446 次生成记录 / 4 万+ 提示词）→ 视频引擎机制落地（P0 已入 main）→ 本次评估「视频引擎的架构和功能提升能否迁移到图片引擎」
> **实证来源**: 桌面契约层（prompt-engine-kernel.js / prompt-engine-contract.js / video-prompt-engine-contract.js）+ 外部引擎（prompt-engine/ 图片 8013 与 video_prompt_engine/ 视频 8020）+ hg-corpus 语料统计（554 条候选文本）

---

## 1. 两引擎现状与关系

### 1.1 桌面契约层（Electron，Multi-Publish）——已完成「共享内核 + 领域分离」

| 文件 | 行数 | 职责 |
|---|---|---|
| `prompt-engine-kernel.js` | 186 | 领域中立共享内核：风格枚举/别名归一、敏感凭据守卫、中立 limits、clampNumber、extractOptimizedBase（fail-closed 校验核心） |
| `prompt-engine-contract.js` | 157 | 图片领域：平台枚举/别名归一、buildPromptEngineOptimizeRequest、extractOptimizedPrompt（kernel base + detected_categories/candidates meta） |
| `video-prompt-engine-contract.js` | 705 | 视频领域：双后端（8013 legacy / 8020 standalone）、语言路由、镜头纪律、双向约束、多切时间块、精修层、结构完整性校验 |

**结论**：桌面契约层**已经拆开且共享**——领域中立逻辑集中在 kernel，图片/视频各自保留领域专属。当前图片契约**尚无** Director-workflow（镜头纪律/双向约束/精修层）字段。

### 1.2 外部引擎层（Python，D:/Data/projects/prompt-engine）——两套独立实现

| 维度 | prompt_engine（图片，8013） | video_prompt_engine（视频，8020） |
|---|---|---|
| 平台策略 | generic/midjourney/stable_diffusion/dalle/tongyi/yizhang/jimeng/xiaohei_storyboard | generic_video/veo/kling/seedance/hailuo/doubao |
| 优化编排 | Optimizer（双级缓存/低创意模板直出/自动风格检测/RAG few-shot/多候选/扰动增强/逆向工程） | VideoOptimizer（双级缓存/关键词维度提示/分类注入/JSON 重试/多候选择优） |
| 评估 | LLM 维度评分（before/after 改进率，disturb 择优用「最长」判据） | evaluate() 规则评分（长度/六要素/镜头字段/保真 4 维，多候选择优） |
| 结构化输出 | 无（纯文本 + detected_categories） | JSON 结构化（shot/camera/motion/.../positive_constraints/final_frame） |
| 领域增强 | 无 | 镜头纪律/事实保真/plausible-only/双向约束/多切时间块/精修层 |

**结论**：外部引擎层**没有共享内核**——视频引擎是独立实现（刻意不 import prompt_engine），机制没有回流到图片引擎。

---

## 2. 视频引擎提升清单（Higgsfield 机制落地实证）

以下机制均已在视频侧实现（带代码出处）：

| # | 机制 | 实现位置 | 核心逻辑 |
|---|---|---|---|
| V1 | 镜头纪律（Lens Discipline） | video strategies/base.py `build_lens_discipline_section` | EXACT N 角色声明 / 单镜单运镜+slow / 三角色上限 / 正负向分块 / FINAL FRAME 收尾 |
| V2 | 正向约束 + 最终画面字段 | models.py `VideoPromptMeta.positive_constraints/final_frame` | STRICT 必须块 + 终态描述（位置/姿势/灯光/机位/禁文字） |
| V3 | 负面提示词 plausible-only | base.py `Negative Prompt Discipline` | 只列真实失败类别（身份漂移/重复角色/解剖错误/文字伪影），禁绝对否定词堆砌 |
| V4 | 双向约束字段 | video-prompt-engine-contract.js `normalizeVideoMeta` | excluded_characters / no_swap_pairs / color_ratio（防身份漂移/防替换/色彩比例） |
| V5 | 结构完整性 fail-closed | `_assertReferenceProtocol` | 声明排除/防替换但正文无引用协议标记（<<< / [ABSENT]）→ 拒绝 |
| V6 | 多切时间块 | `_normalizeShots/_normalizeBeats` | shots[]（≤3）/ beats[]（≤6/切，15s 拆 6 拍）对应七段骨架 ACTION 节拍 |
| V7 | 收尾参数行 + 平台画像 | `appendVideoTrailer` + `PLATFORM_VIDEO_PROFILES` | Photoreal./NON-IP./aspect/duration/audio 段，按平台画像 |
| V8 | 精修层 max_length 层级 | `_resolveVideoMaxLength` | creative_level ≥7 → 5000 字符精修预算；未显式传按层级默认 |
| V9 | 事实保真（Fact-Fidelity） | prompt_builder.py `build_context_section` | 不得改变主体身份/时代/事件事实；context 事实锚点 |
| V10 | context 白名单 + 敏感键拦截 | `normalizeVideoContext` + kernel `assertNoSensitiveContext` | 白名单键（synopsis/character/setting/character_list/full_text），未知键忽略，敏感键拒绝 |
| V11 | 语言路由 | `_resolveOutputLanguage` | 显式参数 → 平台集合（国产 zh/国外 en）→ model 关键词 → CJK 检测 |
| V12 | 规则评估择优 | video evaluator.py `evaluate/select_best` | 长度/六要素/镜头字段/保真 4 维评分，多候选择优 |
| V13 | JSON 结构化重试 | optimizer.py `JSON_RETRY_HINT` | 非严格 JSON → 带提示重试（≤max_retries）→ 耗尽回退原文 |
| V14 | 推理块剥离 | `strip_reasoning_blocks` | 剥离 <think>...</think>，无闭合前缀视为空 |
| V15 | 关键词维度提示 | optimizer.py `keywords_hint` | 命中关键词词典 → 镜头/运镜/光影/色彩/风格维度建议注入 |

---

## 3. 逐项迁移评估（核心问题：能否用于图片引擎）

### 3.1 完全可迁移（领域中立，图片直接受益）——10 项

| 机制 | 图片侧适配方式 | 迁移难度 | 收益 |
|---|---|---|---|
| V3 负面 plausible-only | 图片 negative_prompt 重写为「真实失败类别」（解剖/多余肢体/多余手指/文字伪影/风格漂移/身份漂移） | 低 | 高——图片负面词同样堆砌无效绝对否定 |
| V2 正向约束分块 | 图片输出「STRICT 必须块 + 终态描述」：主体/姿势/光线/构图/禁文字 | 低 | 高——连环画/分镜场景硬约束 |
| V9 事实保真 | 图片文案转图（历史人物/事件）同样不得改主体/时代/事实；context 锚点（synopsis/character/setting） | 低 | 高——图文一致性是 Story2Video 核心 |
| V10 context 白名单 | 图片契约扩展 context 白名单（synopsis/character/setting/character_list）——图片契约目前只透传 synopsis | 低 | 中——角色一致性需要 character/character_list |
| V8 精修层长度 | creative_level ≥7 → 更长精修预算（图片 8013 当前 [50,2000]，可加图片精修档） | 低 | 中——高质量图片需要更长描述 |
| V12 规则评估择优 | 图片多候选择优从「选最长」升级为「evaluate() 规则评分」（六要素/长度/保真） | 中 | 高——disturb_and_optimize 的 best 判据目前是 len() |
| V13 JSON 重试 | 图片可输出 6 要素结构化 JSON（subject/action/environment/colors/lighting/style），失败重试 | 中 | 中——结构化便于上层编排/评估 |
| V5 引用协议校验 | 图片声明 excluded 元素时正文须含引用标记 | 中 | 中——防声明与正文脱节 |
| V15 关键词维度提示 | 建 keywords_image.json（光照/材质/构图/风格维度，可复用 26 类 MJ 风格分类器做种子） | 中 | 中——已有 classifier，扩展成本低 |
| V1 镜头纪律（子集） | 图片适配：EXACT N 角色声明、三角色上限（防多余角色）、单视角构图 | 中 | 高——图片同样面临「多出角色/构图混乱」 |

### 3.2 部分可迁移（需适配语义）——4 项

| 机制 | 适配方式 | 说明 |
|---|---|---|
| V7 技术底座/收尾参数行 | 抽象为 `IMAGE_QUALITY_BASELINE`（Photoreal./摄影/灯光/色彩 60:30:10/皮肤细节/物理/禁文字段），按平台画像 | 文章的 12 行技术底座对图片是**单帧电影感**，语料实证出现率 90%+（CAMERA 534/SCENE 515/COLOR 505/SKIN 502/LIGHTING 497/PHOTOREAL 413） |
| V4 双向约束 | excluded_characters/no_swap_pairs 对图片角色替换同样有效；color_ratio 可迁移为图片色彩比例约束 | 图片无时间维度，但身份漂移问题相同 |
| V11 语言路由 | 图片目前强制英文（generic 策略 MANDATORY）。可增加可选 zh 路由（即梦/通义等国产平台吃中文） | 视频已实证；图片默认保持 en 零回归 |
| V14 推理块剥离 | 图片引擎已有 strip_reasoning_blocks（optimizer.py），无需迁移——确认契约层也处理即可 | — |

### 3.3 不可迁移（视频时间/运动专属）——4 项

- V6 多切时间块 shots[]/beats[]（时间维度）
- 运镜相关：motion_intensity / scene_transition / duration_hint / camera motion
- V7 中 duration/audio 段（视频专属）
- 视频平台语言路由的 platform 集合（模型集合不同，但机制可复用）

---

## 4. 迁移收益与风险

### 收益
1. **一致性提升**：Fact-Fidelity + EXACT N 角色 + 双向约束直接解决图片生成的两大翻车点（主体漂移/多余角色）
2. **提示词质量基线**：技术底座片段让图片提示词追上「单帧电影感」基线（语料实证 12 行标记出现率 90%+）
3. **可评估性**：规则评估择优替换「最长即最优」，多候选质量可量化
4. **架构统一**：桌面契约层已共享 kernel；机制回流后外部引擎也可以收敛共享层（图片 8013 的 DomainType 已含 video，天然支持双域）

### 风险与护栏
| 风险 | 对策 |
|---|---|
| 图片模型对长提示词敏感度不同 | 精修层按图片能力范围门控（8013 [50,2000]），creative_level ≥7 才启用精修档 |
| 强制英文输出是图片最佳实践 | zh 路由仅作可选参数，默认 en 零回归 |
| 结构化 JSON 增加失败面 | 沿用视频经验：重试 ≤2 + 耗尽回退原文，fail-closed 校验在契约层 |
| 技术底座片段可能模板化污染 | 作为内置基线片段（builtin），不进入 learnt 池，门禁控制 |
| 双向约束字段增加契约复杂度 | 与视频共用同一收敛函数族（kernel 回收），非法输入丢弃不抛错 |

---

## 5. 落地建议（分层执行）

### 5.1 桌面契约层（Multi-Publish 仓库）——P0 优先
1. **kernel 回收**：把视频侧已验证的领域中立机制回收到 `prompt-engine-kernel.js`：
   - plausible-only 负面词过滤（类别白名单 + 绝对否定词清理）
   - 精修层 max_length 层级语义（`_resolveVideoMaxLength` 泛化为领域无关的 `resolveTieredMaxLength`）
   - 正向约束数组收敛（`positiveConstraintsMax` 上限 + 元素过滤）
2. **图片契约扩展**（`prompt-engine-contract.js`）：
   - context 白名单扩展（synopsis/character/setting/character_list）
   - `extractOptimizedPrompt` 增加 `positive_constraints` 透传（图片结构化 meta）
   - 技术底座基线片段（IMAGE_QUALITY_BASELINE，builtin 注入）
3. **图片评估择优**：`evaluateCandidates` 或现有多候选路径接入规则评分

### 5.2 外部引擎层（prompt-engine 仓库）——P1 对齐
1. 图片 `prompt_engine/evaluator.py` 从「LLM before/after」补「规则评分」通道（复用视频 evaluator 的四维结构，去掉镜头字段改构图字段）
2. `prompt_engine/optimizer.py` 多候选择优改评分制（替代 len() 判据）
3. `prompt_engine/models.py` 图片响应增加 `image` 结构化字段（subject/action/environment/colors/lighting/style/composition + positive_constraints）——与视频 video 字段同构
4. 图片策略 system prompt 增加：事实保真指令 + 正向/负向分块 + EXACT N 角色 + 技术底座

### 5.3 拆/合架构结论（验证）
- **桌面契约层：维持「共享内核 + 领域契约」不拆**——本次迁移正是把视频侧验证过的机制回收到 kernel，让图片侧复用，进一步证明共享内核的价值
- **外部引擎层：维持两个独立包，但图片侧吸收视频机制**（视频引擎刻意独立的原因是其请求/响应模型与 8013 差异大；强行合并反而破坏 8013 兼容）。共享逻辑（evaluator 评分函数、plausible-only 过滤）可下沉到公共工具模块供两包引用
- **优先级**：P2「图片激进、视频保守」——图片可高频探索，适合先落地机制；视频保持人工确认

---

## 6. 下一步（P0 任务清单草案）

1. [ ] kernel 回收：plausible-only 负面过滤 + 层级 max_length + 正向约束收敛
2. [ ] 图片契约：context 白名单扩展 + positive_constraints 透传 + IMAGE_QUALITY_BASELINE
3. [ ] 图片多候选规则评估择优（evaluateCandidates 接入）
4. [ ] 契约测试：新增字段 fail-closed / 缺省兼容 / 白名单拦截（沿用 OPTIMIZE_BATCH 教训）
5. [ ] 外部引擎图片侧对齐（P1，另行排期）
