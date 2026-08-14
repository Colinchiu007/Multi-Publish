# 《Hell Grind》开源项目深度挖掘续篇——档案语料实证分析与引擎承接点

> **版本**: v2.0 ｜ **日期**: 2026-08-14 ｜ **类型**: 技术调研续篇（纯文档，无代码改动）
> **前置**: v1.0 `HELL-GRIND-OPENSOURCE-ANALYSIS-2026-08-13.md`（方法论层）；本文为**档案语料实证层**
> **事实分级**: 【实证】= 一手 API 抓取原文摘录（附文件来源）；【推断】= 基于证据的推断；【参考】= 第三方
> **语料**: Higgsfield 公开 API 抓取 15 文件夹 → 598 条有效提示词（`D:\Temp\hg-corpus\*.json`）
> **引擎**: `D:\Data\projects\prompt-engine\video_prompt_engine\`（8020 独立引擎）+ Multi-Publish 契约层/Story2Video

---

## 零、结论先行（本轮增量发现 TL;DR）

v1.0 回答"**机制上能抄什么**"（引用协议/锁族/时间块/禁令/表演层/自 QA）。本轮回答"**具体怎么抄、抄哪几行**"——基于 598 条真实提示词的结构反推：

1. **模板分层体系（最大发现）**：同一项目内存在 4 层模板——批量层（2-3KB 粗生成）、精修层（21-27KB 导演分镜单）、动作/对话变体层、资产层（1KB 描述符卡）。**这不是"提示词越长越好"，而是"不同阶段用不同形态的模板"**，与抽卡淘汰流水线（63:1）严格对应。
2. **修正 v1.0 两个假设**：① "12 行技术底座每镜全带"不成立——实测 `Style:` 标记仅出现在 23% 的样本中，底座按层级**压缩/展开**；② "七段式骨架"是文章概括——实测精修层是 **18+ 段导演分镜单**（含逐切几何、皮肤、静止锁等 v1.0 未覆盖的块）。
3. **FAIL CHECK = 可判定的验收条件**：精修模板自带 if-then 式失败判据（"如果出现 X 则曝光错误"）——这是 v1.0 漏掉的**评估器级**借鉴点，可直接落成 evaluator 规则扣分（当前 `evaluator.py` 无任何违规扣分）。
4. **POSITIVE LOCKS 是双向约束**：主角锁定（"本镜主角是 X，逐字复用描述符"）+ **缺席角色显式排除**（"X 不在本镜，禁止生成 X，禁止把 A 换成 B"）——引擎已有 `positive_constraints` 正向数组，缺"缺席排除"反向机制。
5. **直接冲突点**：`evaluator.py:20` 长度判据 100-400 词会**惩罚** Higgsfield 式精修模板（语料中位 5,719 字符≈1,200 词）——若不按模板层级分级，引擎永远选不出"导演级"提示词。

---

## 一、语料实证方法

| 项 | 值 |
|---|---|
| 抓取方式 | `fnf-api-gw.higgsfield.ai` 公开文件夹 API（无鉴权），`D:\Temp\hg-corpus\fetch.py` |
| 语料规模 | 15 文件夹、598 条有效提示词（长度 >50 字符） |
| 参数画像 | seedance_2_0 91%、15s 78%、1080p 91%、21:9 72%、generate_audio True 90%、prompt_language en 91% |
| 结构标记频率 | `<<<` 引用 91%、Audio 64%、Composition 57%、Continuity 50%、Lighting 49%、Acting/Camera/Color/Technical 48%、SCENE 44%、**Style 仅 23%**、STRICT 18%、FINAL FRAME 11%、EXACT 10%、CHARACTER/SCENE REF 8% |

### 1.1 文件夹分层实证（按模板形态分组）

| 文件夹 | 条数 | 中位长度 | 结构特征 | 层级判定 |
|---|---|---|---|---|
| `Scene_Orphanage` | 50 | 26,377 | 完整 7 大块：REFERENCES/ENVIRONMENT/COLOR GRADE & STYLE/POSITIVE LOCKS/CONTINUITY/FINAL FRAME + CAMERA(39)/AUDIO(39) | **精修·文戏模板** |
| `Scene_74 / 74C` | 99 | ~21,000 | 🔥 块体系：SCENE NOTE→SPATIAL LAYOUT→LIGHTING→COLOR→CAMERA→ENVIRONMENT→CONTINUITY→CHARACTERS→SKIN→ACTING→STILLNESS LOCK + ROKO/VORTEX POSITIONED 位置锁 + THE VISUAL STATEMENT | **精修·动作戏模板** |
| `Scene_15-16` | 50 | 22,871 | 同精修体系 + **FAIL CHECK(4)** + 逐秒 ACTION TIMELINE（10 秒连续分 6 段） | **精修·对话/表演模板** |
| `Scene_17/13/14/18` | 200 | 2.8-3.4KB | 技术底座压缩版 + 角色映射行（`<<<image_4>>> = ROKO.`）+ 对白驱动表演；`Scene_14` MULTI-SHOT(23) | **批量·粗生成层** |
| `Cinema_Bomb / Credits / Cold_Open` | 150 | 5-7KB | SPATIAL(18)/SCENE(11)/LOCATION PROMPT + CRITICAL CONTINUITY(6)/PICTURE STYLE(3)/PACING(3) | **变体·特效/片尾层** |
| `Assets` | 49 | 1,040 | CHARACTER DESIGN PROMPT 描述符卡 + Negative prompt | **资产层** |
| `Regenerations/Series/Flashbacks` | 0 | — | API 返回空 items | 未开放或分页空 |

> 【实证】同一角色（ROKO/JAX/REIN）在批量层用 `<<<image_N>>>` 序号占位，在精修层用 `<<<UUID>>>` 全局标识——**占位符体系随层级升级**，这是"抽卡→精修"管线的直接证据。

---

## 二、模板分层体系详解（本轮最大发现）

### 2.1 批量层解剖（Scene_17 样本，3,227 字符）

结构 = **技术底座压缩版（12 行浓缩为 1 段）+ 角色映射行 + 对白驱动表演**：

```
8K IMAX. Photorealistic, photographed on a physical motion-picture camera. No 3D render,
no game engine. Genre: Modern action blockbuster. References: cinematography of
Emmanuel Lubezki and Roger Deakins. Lighting: Only natural light and practicals...
Color: 60:30:10 — dominant / secondary / accent. Camera: Physical cine lens. 180°
shutter motion blur... Acting: Hollywood-grade — micro-pauses before reactions, precise
eye-line, wet living eyes... Composition: Thirds + golden ratio... Technical: 60fps...
Audio: Environmental SFX only. No music, no subtitles.

<<<image_4>>> = ROKO. <<<image_3>>>= JAX. <<<image_2>>> = REIN. <<<image_5>>> = Gandelfina.

Gandelfina <<<image_5>>> — 40s, long black trenchcoat... walks at a measured pace...
Rein <<<image_2>>> — says to Gandelfina with analytical urgency: "Wait, hold on..."
```

要点：
- 底座 12 项被压成**一句一段**（每项一行分号连接），只保留"拍摄语言常量"；
- **角色映射表**：`<<<image_N>>> = 角色名` 一行解决多角色身份绑定（批量阶段不需要描述符全文）；
- 表演 = 对白 + 微表演提示（"controlled but raw — not rage, a man running on grief"），无几何细节。

### 2.2 精修层解剖（Scene_74 样本，27,340 字符，完整块序）

```
🔥 SCENE NOTE 🔥            — 三切序列叙事（CUT 1/2/3 各自拍什么、叙事终点）
🔥 SPATIAL LAYOUT 🔥        — 场景描述 + 逐 CUT geometry（机位高度/朝向/角色屏幕位置/视线/入画出画方向）
🔥 LIGHTING 🔥              — 光源类型/方向/色温/禁项（NO hard key light, NO golden hour）
🔥 COLOR 🔥                 — 60:30:10 三色比率 + 每切点缀色分配
🔥 CAMERA — 导演风格 🔥     — 风格引用（Vinterberg handheld）+ 每 CUT 焦段（35mm/85mm）+ 摄影指导（Lubezki×Deakins）+ REAL PHYSICS
🔥 ENVIRONMENT 🔥           — 环境物理（雪的方向/堆积/能见度）
🔥 CONTINUITY 🔥            — 跨切一致性声明（same lighting/snowfall/wind across all cuts）
🔥 CHARACTERS 🔥            — 逐角色 UUID + 完整描述符（服装破损/血迹/积雪实时状态）
🔥 SKIN 🔥                  — 皮肤细节专属块（毛孔/伤疤/脏污/湿度）
🔥 ACTING 🔥                — 表演层（视线/微表情/呼吸/静默）
🔥 STILLNESS LOCK 🔥        — 静止锁（动作戏中锁定"静"的段）
... BEAT 1/2/3 (x.x-y.y s)  — 秒级动作时间线（每 beat 一个动作 + 一个运镜状态）
AUDIO 🔥                    — 带秒级时间锚的音效设计（seconds 0-4 脚步）
收尾参数行                   — Photoreal. NON-IP. 16:9. 15s. SFX only. NO CGI. Cinematic.
```

**CUT 几何原文实证**（逐切空间布局）：
```
CUT 1 geometry: camera positioned at chest-height looking forward at the tableau...
<<<455232e3-...>>> kneels in middle ground center FACING CAMERA. His EYES look THROUGH
and PAST the camera into the far distance...
CUT 3 geometry: EXTREME CLOSE-UP INSERT on <<<daf0186f-...>>>'s face — frame fills
entirely with his face, BARE without glasses. Across the cut <<<455232e3-...>>>'s
BLOODY PALM enters from the top of frame and SWEEPS DOWN...
```
每切包含：机位（高度/角度/景别）+ 每角色（屏幕区域/朝向/视线/前景-背景分层）+ 跨切入画方向。

**ACTION TIMELINE 原文实证**（Scene_15-16，连续 10 秒分 6 段）：
```
Action timeline (continuous 10 seconds):
[0.0–1.0s] <<<76c847f2-...>>> enters the right side of frame FROM the entrance area...
Cane strikes wood floor rhythmically. The CLOSED/FOLDED wet <<<7cb38e5d-...>>> held
HORIZONTALLY in her left hand drips water onto the floor...
[1.0–3.0s] ... walks leftward through middle of frame. <<<e92f3ea2-...>>> enters frame
from the right side behind her (gap visible between them)...
```

### 2.3 资产层解剖（Assets 50 张卡，中位 1,040 字符）

```
CHARACTER DESIGN PROMPT — COMBAT TRAINING ROBOT
Full-body character design sheet. Front view + back view + 3/4 fighting stance view.
Ultra-realistic cinematic design of a brutal humanoid combat training robot, full body,
dark matte-black and gunmetal exoskeleton, skeletal mechanical anatomy, exposed hydraulic
pistons, carbon-fiber muscle-like cables, skull-like robotic head with a single glowing
red sensor eye... standing in a tense fighting stance... dark gray background #808080...
Negative prompt: cartoon, anime, fantasy armor, colorful design, bulky transformer,
overly futuristic, toy-like, plastic, clean sci-fi suit, wings, guns, text, logo,
extra limbs, bad anatomy, blurry, low detail.
```
要点：同一资产存在**多个描述符变体**（concept-art 版 + documentary-photo 版）——不同生成阶段用不同"镜头语言"描述同一角色；`#808080` 灰底是资产卡的显式背景协议。

### 2.4 对引擎的启示（模板形态切换）

| 引擎概念 | 现实现 | Higgsfield 分层语义 |
|---|---|---|
| `creative_level` 1-10 | 只调细节文字（"简洁/适中/丰富"） | 应切换**模板形态**：≤3=批量形态（底座压缩+映射行）；4-7=精修形态（逐切几何+时间线+锁）；8+ =精修+FAIL CHECK |
| `max_length` | 单一上限 | 按层设预算：批量 2-3K、精修 20K+ |
| evaluator 长度判据 | 100-400 词一刀切 | 必须层级感知（见第六部分） |

---

## 三、可借鉴机制详解（带原文实证）

### 3.1 FAIL CHECK：可判定的验收条件 → evaluator 规则扣分（v1.0 未覆盖）

```
FAIL CHECK: in both shots, characters' FACES must remain in DEEP NEAR-PURE-BLACK
SHADOW — features ENTIRELY UNREADABLE except faint rim catchlights... If any face is
visible with full detail, if any frontal fill appears, if any warm color enters —
the exposure is WRONG.
```
- 【实证】这是**if-then 式可判定判据**，不是"不要怎么样"的禁令——禁令写给生成模型，FAIL CHECK 写给人/评估器；
- 【推断】可机器化：把 FAIL CHECK 解析为规则表达式（"faces fully detailed → fail"），由 evaluator 对输出提示词做文本断言；
- 引擎现状：`evaluator.py:11-59` 评分 = 长度20 + 六要素30 + shot20 + camera15 + motion15 + 保真20，**无规则违规扣分项**——FAIL CHECK 机制可以直接补进评分公式（违规 -N 分，而非仅加分制）。

### 3.2 POSITIVE LOCKS：主角锁定 + 缺席排除（双向约束）

```
- THIS SHOT IS ABOUT <<<067b4940-...>>>. The hero in every frame of this shot...
is <<<067b4940-...>>> (per <<<067b4940-...>>> reference image). His face, hair, skin
tone, clothing and build resolve EXACTLY to the reference image. He is the protagonist.
- <<<6b8e81c5-...>>> IS NOT IN THIS SHOT. <<<6b8e81c5-...>>> is off-frame entirely...
Do NOT generate <<<6b8e81c5-...>>> inside the frame. Do NOT swap <<<067b4940-...>>>
for <<<6b8e81c5-...>>>. Do NOT have <<<6b8e81c5-...>>> approach... The hero approaching
... is ALWAYS <<<067b4940-...>>>, NEVER <<<6b8e81c5-...>>>.
```
- 【实证】每镜 POSITIVE LOCKS = 主角锁定（"本镜属于谁"）+ **缺席角色排除**（"谁绝不能出现"）+ 防替换（"禁止 A↔B 互换"）；
- 引擎现状：`generic_video.py:94` 已有 `positive_constraints`（正向数组）与 `final_frame`，但**无缺席排除、无防替换语义**；
- 【推断】落地：positive_constraints 增加 `excluded_characters[]` 与 `no_swap_pairs[]` 结构字段，system prompt 输出对应块。

### 3.3 CUT 几何：逐切空间布局（引擎 shot/camera 单值化 vs Higgsfield 多切结构）

- 【实证】精修层每切一段 geometry：机位（高度/角度/景别/焦段）+ 每角色（屏幕左/中/右、前景/中景/背景、朝向、视线、入画/出画方向）；
- 引擎现状：`generic_video.py:71-82` 输出 `shot`/`camera` 各一值 + `scene_transition` 枚举——**单切模型**；`duration_hint` 恒为 null；
- 【推断】落地：`shots[]` 结构字段（每切：shot/camera/duration/geometry 摘要），至少支持"2-3 切"枚举；`duration_hint` 填真实秒数。

### 3.4 时间轴三体系（并存，按需选用）

| 体系 | 格式 | 频率 | 用途 |
|---|---|---|---|
| 切段 | `[SHOT 1] [SHOT 2] [SHOT 3]` | 46/46/26 | 多切分镜 |
| 硬切点 | `[HARD CUT at 0.5s] / [HARD CUT at 5.0s] / [HARD CUT at 9.0s]` | 39/18/16 | 明确剪切时刻 |
| 秒级动作 | `[0.0–1.0s] [1.0–3.0s] [3.0–5.0s]` + `BEAT 1 (3.5-5s)` | 14+ / 多 | 连续动作编排 |

- 【实证】种子库 `seed_video_prompts.json` 条目**已有 `visual_details.beats[]`（time/action）**——时间块输出改动量比预期小；
- 【推断】引擎输出侧只需：把 beats 从"可视化辅助"升级为"生成约束"（每 beat 一个动作 + 一个运镜状态，即 CINEDANCE 的"每时间戳内命名一个运镜"）。

### 3.5 导演风格引用 + 每切焦段（风格库化）

- 【实证】`CAMERA — VINTERBERG-STYLE HANDHELD MEASURED`；`Cinematography: Emmanuel Lubezki × Roger Deakins`；`CUT 1 = wide 35mm... CUT 3 = extreme close-up insert 85mm`；
- 引擎现状：`style` 为自由文本，无导演风格人名库、无焦段-景别配对约定；
- 【推断】落地：`knowledge/` 新增"导演风格词典"（人名→风格一句话），system prompt 按风格输入注入参考人名 + 每切焦段建议（35mm 广角/50mm 标准/85mm 特写）。

### 3.6 COLOR 60:30:10 三色比率

- 【实证】`COLOR: 60:30:10 — dominant / secondary / accent`（批量层）；精修层展开为"主导色 60 + 次要色 30 + 点缀色 10 + 每切点缀分配"（如 CUT 3 的血迹深红 + 颧骨绿纹）；
- 引擎现状：六要素 Color Palette 无比率约束；
- 【推断】落地：system prompt 增加"三色比率"强制项，输出结构 Color 段按 60:30:10 组织。

### 3.7 收尾参数行（元数据打包）

- 【实证】`Photoreal. NON-IP. 16:9. 15s. SFX only. NO CGI. Cinematic.`——精修层尾部一行打包全部元数据（画幅/时长/音频/风格/非 IP 声明）；
- 【推断】对引擎价值：**NON-IP 声明**是当前引擎完全没有的维度（版权合规提示词）；可把元数据行作为 `prompt` 字符串的固定收尾模板（对国产/海外模型均适用）。

### 3.8 SKIN / STILLNESS LOCK / ACTING 专属块

- 【实证】`🔥 SKIN 🔥`（皮肤专属：毛孔/伤疤/血迹/积雪附着）、`🔥 STILLNESS LOCK 🔥`（动作戏锁定静止段——呼吸节奏）、`🔥 ACTING 🔥`（表演 = 视线+微表情+呼吸+静默，非情绪标签）；
- 禁令聚类呼应：皮肤细节 44%、视线/镜头感 60%——这两类是 Higgsfield 最高频的失败区，值得进引擎默认负面词/检查项。

---

## 四、平台参数画像（策略校准依据）

| 参数 | 分布 | 引擎落点 |
|---|---|---|
| model `seedance_2_0` | 91% | seedance 策略默认参数对齐 |
| duration `15s` | 78% | duration_hint 默认 15s |
| resolution `1080p` | 91% | 输出 quality 建议 |
| aspect `21:9` | 72% | 默认画幅（电影感） |
| `generate_audio True` | 90% | Audio 块输出开关默认开 |
| `prompt_language en` | 91% | 英文提示词主体 + 中文映射 |

> 【推断】平台策略 `strategies/seedance.py` 应内置"15s/1080p/21:9/audio on"默认矩阵，与契约层 `BUILT_IN_VIDEO_NO_TEXT_NEGATIVE` 同级。

---

## 五、引擎差距对照表（借鉴点 → 现状 → 差距）

| # | 借鉴点 | Higgsfield 实证 | 引擎现状（file:line） | 差距 |
|---|---|---|---|---|
| 1 | 模板分层 | 批量 2-3K / 精修 21-27K / 资产 1K | `generic_video.py:38-43` creative_level 只调文字；`evaluator.py:16-20` 长度一刀切 | 形态级差距 |
| 2 | FAIL CHECK | if-then 验收判据 | `evaluator.py:51-58` 无违规扣分 | 可加规则项 |
| 3 | POSITIVE LOCKS | 主角锁定+缺席排除+防替换 | `generic_video.py:94` 仅正向数组 | 缺反向约束 |
| 4 | CUT 几何 | 逐切机位/角色屏幕位置/视线 | `generic_video.py:71-82` 单 shot/camera 值 | 缺多切结构 |
| 5 | 时间轴 | [SHOT N]/[HARD CUT]/[0.0–Xs] 三体系 | `seed_video_prompts.json` 已有 beats[]；输出无时间块 | 输出侧升级 |
| 6 | 导演风格引用 | Lubezki×Deakins/Vinterberg + 35/85mm | `style` 自由文本 | 缺风格词典 |
| 7 | COLOR 60:30:10 | 三色比率+每切点缀 | 六要素 Color 无比率 | 加比率契约 |
| 8 | 收尾参数行 | NON-IP/16:9/15s/SFX only | 无 | 加固定收尾 |
| 9 | SKIN/STILLNESS/ACTING 块 | 专属块 | `storyboard-prompt.ts:26-64` 无 objective/tactics/beats 意图层 | 缺表演层 |
| 10 | 角色描述符库 | Assets 50 卡+变体 | `story-context-engine.js:30-32` 角色仅名字 | 缺描述符资产库 |
| 11 | 缺席角色排除 | "X IS NOT IN THIS SHOT" | context 无 active_references | 缺在场/缺席白名单 |
| 12 | 失败模式闭环 | COMMON FAILURES 22 行表 | `feedback.py:36-66` good→9 分/bad→种子-1，无 failure_pattern 采集；`schema.js:19` FEEDBACK_TYPES 无 failure_pattern | 缺失败模式知识库 |

---

## 六、冲突点：evaluator 的长度假设（必须处理）

- `evaluator.py:20`：`length_ok = 100 <= words <= 400`（en）；语料实证：精修层中位 22,871 字符 ≈ **4,500+ 词**（是上限的 11 倍）；
- 后果：如果引擎按 Higgsfield 精修形态输出，evaluator 直接判 length 失败（-20 分）→ 多候选择优永远偏向短提示词 → **引擎无法进化出导演级提示词**；
- 【推断】修法：长度判据改为层级感知（批量层 100-400 词 / 精修层 500-5,000 词），或在评分中把 length 从硬门槛改为软加分（长度与信息密度、块覆盖度联合计分）。

---

## 七、落地建议（增量于 v1.0 Phase 1-5）

### P0（可直接进 v1.0 Phase 1/2 工单）
1. **evaluator 规则扣分 + 层级长度**（`evaluator.py`）：新增 `violations[]` 扣分项（FAIL CHECK 判据、缺席角色出现、无 Audio 块等）；长度按层级分级；
2. **positive_constraints 扩展**（`generic_video.py:94` 输出契约 + 契约层 `video-prompt-engine-contract.js`）：加 `excluded_characters[]`、`no_swap_pairs[]`、`color_ratio`（60:30:10 默认）；
3. **收尾参数行模板**：`prompt` 末尾固定追加 `Photoreal. NON-IP. {aspect}. {duration}s. {audio} only. No {text}.` 参数行；
4. **时间块输出**：把 `seed_video_prompts.json` 已有 beats[] 升为输出字段（`[0.0–X.Xs]` + 每 beat 一动作一运镜）。

### P1（进 v1.0 Phase 3/4）
5. **模板形态切换**：creative_level ≤3 走"批量形态"（底座压缩+角色映射行），≥4 走"精修形态"（逐切几何+时间线+锁）；平台策略注册表增加形态字段；
6. **导演风格词典**：`knowledge/` 新增 10-20 位导演/摄影指导人名→一句话风格（Lubezki 手持自然光 / Deakins 光影对比 / Vinterberg 手持纪实等）；
7. **失败模式闭环**：`feedback.py` 增加 failure_pattern 采集，FAIL CHECK 判据沉淀为规则库（承接 v1.0 B-5）；
8. **角色描述符资产库**：Assets 卡模式（正/背/3-4 视图描述符 + Negative + 变体）→ `story-context-engine.js` 输出描述符 + 引用声明。

### P2（远期）
9. 全量语料资产化：598 条真实提示词 + 50 资产卡入库为 few-shot 样例库（当前种子库 140 条为自研，可交叉验证）；
10. 抽卡成本模型：63:1 淘汰率 → 引擎多候选评估的成本-收益参数化（num_candidates 建议值推导）；
11. CUT 几何结构字段（`shots[]`）进契约层，支持"2-3 切"枚举输出。

---

## 八、数据附录

- 语料：`D:\Temp\hg-corpus\`（15 json；抓取脚本 `fetch.py`；样本：`247b6ce9_Scene_74.json`（27KB 动作精修）、`b9e777b3_Scene_Orphanage.json`（26KB 文戏精修）、`28fc11ed_Scene_15-16.json`（22.9KB 对话精修+FAIL CHECK）、`5c539312_Scene_17.json`（3.2KB 批量）、`34c88b2f_Assets.json`（50 资产卡））
- 引擎：`D:\Data\projects\prompt-engine\video_prompt_engine\`（`evaluator.py` 77 行、`strategies/generic_video.py` 100 行）
- 前作：v1.0 `01-docs/HELL-GRIND-OPENSOURCE-ANALYSIS-2026-08-13.md`
- 抓取 API：`fnf-api-gw.higgsfield.ai/fnf/folders/{id}/items/v2?size=50`（2026-08-13 可达，无鉴权）

---

*报告完。本报告所有【实证】条目均可在 `D:\Temp\hg-corpus\` 复核；【推断】已标注。建议：实施 P0 前走 OpenSpec propose（M+ 任务规则），evaluator 改动需回归测试覆盖"精修层长提示词不被误杀"。*

---

## 九、落地状态附录（2026-08-14 追记，任务 4.3 闭环）

> 报告 §七 P0/P1/P2 全部落地。跨两个仓库：prompt-engine（8020 引擎侧）+ Multi-Publish（契约层）。

### P0（全部完成）
| # | 借鉴点 | 落地点 | 证据 |
|---|---|---|---|
| 1 | evaluator 规则扣分 + 层级长度 | prompt-engine `evaluator.py` violations[] 扣分（缺席角色/swap/缺尾行/缺 Audio）+ 批量 100-400 词 / 精修 500-5,000 词 | PR #35/#37/#38 + `tests/test_higgsfield_p0.py` |
| 2 | positive_constraints 扩展 | 契约层 `video-prompt-engine-contract.js` excluded_characters[]/no_swap_pairs[]/color_ratio + 引擎输出 | Multi-Publish PR #805、prompt-engine PR #35 |
| 3 | 收尾参数行模板 | `appendVideoTrailer` 纯函数（NON-IP/画幅/时长/音频，幂等 + 超长保 NON-IP） | Multi-Publish PR #805、prompt-engine PR #35 |
| 4 | 时间块输出 | shots[]/beats[] 契约收敛（≤3 切、每切 ≤6 beats、beatTimeMax 40）+ 引擎输出 | Multi-Publish PR #805、prompt-engine PR #35 |

### P1（全部完成）
| # | 借鉴点 | 落地点 | 证据 |
|---|---|---|---|
| 5 | 模板形态切换 | creative_level 形态语义 + 精修层 max_length 层级上浮（默认 5000 / 上限 20000） | Multi-Publish PR #805、prompt-engine PR #37 |
| 6 | 导演风格词典 | `director_styles.json` 17 位导演 + system prompt `## Director Style Reference` 注入 | prompt-engine PR #38 |
| 7 | 失败模式闭环 | `failure_patterns.json` 12 条规则 + feedback failure_stats 采集 + evaluator FAIL CHECK 扣分 | prompt-engine PR #38、PR #35 |
| 8 | 角色描述符资产库 | `character_descriptors.json` 8 张 Assets 卡 + `## Character Reference Library` 注入 | prompt-engine PR #38 |

### P2（全部完成）
| # | 借鉴点 | 落地点 | 证据 |
|---|---|---|---|
| 9 | 全量语料资产化 | `seed_higgsfield_prompts.json` 258 条（590 去重）+ 幂等重建脚本 + loader 合并 + 预算硬化注入 | prompt-engine PR #42（待合并） |
| 10 | 抽卡成本模型 | `docs/HELLGRIND-NUM-CANDIDATES-COST-MODEL.md`（batch 3-5 / refined 1-2 候选） | prompt-engine PR #42 |
| 11 | CUT 几何 shots[] 进契约层 | 契约层 shots[]（≤3 切）+ `videoMaxLengthRanges` 20000 | Multi-Publish PR #805 |

### 平台参数画像（§四）
- seedance 默认矩阵 15s/1080p/21:9/audio on → `PLATFORM_VIDEO_PROFILES` 常量（契约层） + 引擎 seedance 策略默认对齐

### 评审与测试基线
- 镜头纪律：Multi-Publish `video-prompt-engine-contract.test.js` 93/93，关联套件 240/240（review 0 Critical）
- Higgsfield P0/P1：prompt-engine 全量 598→616→628 passed（随阶段递增）
- P2 语料资产化：+26 项，全量 654 passed / 3 skipped（Claude 评审 0 Critical / 5 Warning 全修复）
