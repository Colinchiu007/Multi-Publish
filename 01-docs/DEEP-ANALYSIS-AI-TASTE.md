# 去 AI 味开源项目深度分析（rewrite-engine v2 移植参考）

> 调研日期：2026-09-08
> 调研对象：4 个开源「去 AI 味 / 人性化改写」项目全文精读
> 目标：为 `packages/rewrite-engine` v2 的 AI 味检测与改写能力提供模式清单、算法、验证方法、可移植代码
> 现状对照：v1 引擎 `packages/rewrite-engine/src/ai-taste-remover.js`（191 行）+ v2 编排 `rewrite-engine-core.js`
> 克隆位置：`D:\Temp\deep-ai-taste\`（临时目录，不属于工作区，无需清理）
> 证据边界：本文件所有数字均出自下列仓库原文，引用格式 `[项目:文件:行号]`；「推断」一律标注

## §0 执行摘要

| 项目 | 版本/形态 | 核心贡献 | 对 v2 的最大价值 |
|---|---|---|---|
| **blader/humanizer** | v3.0.0，纯文本 SKILL（375 行，无代码） | 25 个模式按强度排序（§1-5 单次命中即改）；四步流程（标记→改写→校验→定稿）；voice matching；事实保真铁律 | 模式强度分级 + 「不加不丢」改写纪律；英语词表可直接翻译移植 |
| **op7418/Humanizer-zh** | 中文翻译版 SKILL（485 行） | blader 的中文化：24 模式、中文特有处理（弯引号反转、标题大小写不适用）、50 分质量评分表 | 中文词表与检查清单；⚠️ 其示例会添加原文没有的细节，移植时以 blader 约束为准 |
| **Nanako0129/sepia** | v0.9.0，Skill 包（SKILL + 15 个 references） | 文体分层路由（小说/专业 5 域）；四操作（write/review/refactor/recreate）；三层 pass（叙事/话语/表层）；**句长方差算法**；zh.md 中文校准；模型指纹 | 「均值不是信号、SD 才是」的节奏检测 + 中文校准数值（HC3）是 v2 缺失的检测维度 |
| **epoko77-ai/im-not-ai** | v2.3.2，韩语 Skill + Python 脚本 | 10 大类 × 70+ 子模式的 AI 味分类体系（SSOT）；S1/S2/S3 严重度；span 检测 JSON 契约；**反注入护栏**（改写器会制造新 AI 味，实测逆注入）；4 轴验证门；人类基线反转防误报；3 级路由 | 工程化最完整：检测→改写→验证的闭环、反注入脚本、变更率门——是 v2 从「正则替换器」升级为「检测-改写-验证管线」的模板 |

**四条总纲性结论（贯穿全文）：**

1. **检测器优先于改写器。** im-not-ai 与 sepia 都以「先诊断后改写」为骨架：im-not-ai 的 standard/heavy 路径固定先跑 diagnostician，sepia 的 review/refactor 强制先出缺陷清单。v1 直接盲改是最大结构性缺陷。
2. **反注入护栏是硬需求。** im-not-ai 实测改写器会逆注入新的 AI 味（C-11 连接词后逗号 16/28 篇逆注入、C-8 对仗从 12→14 篇扩散、D-9/D-10 结论句式 2→4 与 0→2）。改写后必须做「计数 ≤ 原文」的确定性校验，不能信任 LLM 自报。
3. **人类基线反转是防误报关键。** 多个「公认 AI 味」模式实测人类用得更多（韩语语料：A-1「对/关于」人类 3 倍、A-11「为了」人类更多、I-1「것이다」人类 2 倍；sepia HC3：人类句长均值更长但方差更大、语气词 5 倍）。v1 无条件替换「此外」等词会损坏人类文本。
4. **LLM 改写 + 规则验证混合是落地形态。** 四个项目没有一个用纯规则完成改写：im-not-ai 用 LLM 执行改写、规则/脚本做检测与验证；sepia 用 LLM 按结构化 rubric 诊断。v2 已有 LLM 编排（rewrite-engine-core），缺的是「规则检测器 + 确定性验证门」这两个外围件。

---

## §1 blader/humanizer v3.0.0

来源：`D:\Temp\deep-ai-taste\blader_humanizer\SKILL.md`（375 行）。纯文本规范，无代码。基于维基百科「Signs of AI writing」。

### 1.1 核心理论

AI 文本的根源：语言模型写「统计上最可能的下一个词」，人写「对这一个读者、这一个主题的选择」。因此人写的东西是不均匀、具体的，AI 是均匀、泛化的。五个成因类别：舞台化（Staging）、规则化节奏（Rhythm by rule）、膨胀（Inflation）、规则化排版（Formatting by rule）、残留（Leftovers）。

两条推论（原文 §前）：① 保留的每个句子必须给读者新东西；② tell 的严重度 = 谨慎的作者有意为之的频率有多低。

### 1.2 25 个模式完整清单（按强度排序）

强度规则：**§1-5 单次命中即改**；标注 weak alone 的模式需与同段落其他 tell 相伴才动手。

| # | 模式 | 触发示例 | 处理 |
|---|---|---|---|
| 1 | Not X but Y（否定式排比） | not just/not only…but；it's not X, it's Y；跨句分裂（"This does not mean X. It means Y."）；clipped tail（", no guessing"） | 直接陈述；仅当否定半句纠正读者真实持有的信念时才保留 |
| 2 | 单行金句收尾/戏剧性片段 | "That is the real win." "Let that sink in." 每节重复同一收尾；片段行（"No aesthetic prior. No nostalgia."）；全大写/句点间隔单词 | 重复收尾删除；片段行合并成带具体主张的句子 |
| 3 | 假装深刻的格言 | the real question is / at its core / fundamentally / X is the Y of Z / the language of / the currency of | 换成具体主张；格言解包 |
| 4 | 开场铺垫（staged run-up） | Let's dive in / here's what you need to know / without further ado / Honestly? / Here's the thing / The thing is / Let's be honest | 移除铺垫本身，不只移除语气 |
| 5 | 与空气辩论 | This isn't about / I'm not saying / To be clear / Don't get me wrong / Some might say…but / A tempting approach would be | 删防御；有真实主张则陈述主张；保留文本实际回应了的反对意见 |
| 6 | 强制三段式（triads） | 创新、灵感、洞察三连；三个平行例；三个短事实+一句教训 | 每项必须承载独立想法，否则合并/变结构；真需要三时才留三 |
| 7 | 重复句首 | 连续句以同一主语开头（she/she/she） | 合并、换主语、以动作开头；不禁止单次重复（"She came. She saw." 是蓄意节奏） |
| 8 | 破折号万能连接 | em dash/en dash 到处出现（含 `--`） | 改写后不得含破折号（除非样本用）；换句号/逗号/冒号/括号 |
| 9 | 堆叠限定词（weak alone） | to be fair / could potentially / might arguably / this is an inference | 保留来源支持的限定；普通 hedge（perhaps/tends to）是人类习惯不是 tell |
| 10 | 连字符词组（weak alone） | cross-functional, data-driven, high-quality（每个位置都连字符） | 名词前保留（a high-quality report），名词后去掉（the report is high quality） |
| 11 | 被动/缺主语（weak alone） | No configuration file needed. The results are preserved. | 补出施动者 |
| 12 | 过度用 AI 词（唯一词表） | actually/additionally/align with/crucial/deep dive/delve/enhance/foster/highlight/intricate/landscape/pivotal/robust/showcase/tapestry/testament/underscore/vibrant 等 | 模型比人用得多的词；成群出现才是 tell |
| 13 | 夸大意义 | stands as a testament / pivotal moment / plays a key role / Challenges and Legacy / Future Outlook / the future looks bright | 保事实去装点；以最后一个具体事实结尾 |
| 14 | 模糊关联 | associated with / in connection with / linked to | 说出关系（CEO？董事？顾问？）；来源没说就保留模糊，不编造 |
| 15 | 浅层 -ing 拖尾 | highlighting/underscoring/reflecting/symbolizing/contributing to 挂到简单事实上 | 保事实；仅来源支持才留拖尾 |
| 16 | 销售语言 | boasts/vibrant/nestled/in the heart of/groundbreaking/renowned/must-visit/stunning | 陈述是什么即可 |
| 17 | 借权威 | experts argue / industry reports / 知名度媒体列表 / active social media presence, over N followers | 用真实来源及原话；否则删；绝不发明来源 |
| 18 | 回避 is/are/has | serves as / stands as / features / boasts / offers / refers to | 用简单动词 |
| 19 | 加粗装饰 | 无理由加粗；列表每项「粗体标签:」 | 去粗体；标签无信息时改散文 |
| 20 | 装饰性标题 | 标题全大写；emoji/箭头装饰；节间横线；顶级标题重复标题本身 | 改 sentence case；去装饰；标题只出现一次 |
| 21 | 弯引号（weak alone） | 目标格式用直引号却出现弯引号 | 对齐目标格式 |
| 22 | 聊天残留（最确定 tell） | I hope this helps / Of course! / Certainly! / Great question! / Would you like…/ Want me to…? / Should I continue? | 直接删除包裹，保留内容 |
| 23 | 知识截止免责与猜测 | as of [date] / up to my last training update / not publicly available / likely [grew up] / it is believed that | 陈述来源未显示的内容或删句；猜测绝不当事实 |
| 24 | 标题被首句重复 | 标题下第一句复述标题 | 删除重复句 |
| 25 | 写「上一个版本」 | 文档/注释描述被替换的旧行为 | 只写当前行为；变更记录除外 |

### 1.3 四步流程

1. **标记**：通读全文标记所有 tell，最强优先；看段落形状（跨两句的对比、三个平行例、每节同一收尾 = 更大尺度的同一 tell）。
2. **改写**：保留每个受支持的主张；可删冗长、合并/拆分段落、改结构，但信息不变。**不添加来源或用户没给的事实/名字/数字/日期/引文**。缺细节就询问或写更简单的句子。观点/反应在声音需要时允许，事实主张不允许。虚构文体豁免（编造细节是任务本身）。
3. **校验**：朗读；问「哪里还像 AI」；检查是否添加/丢失事实（unsupported addition = 错误，lost claim = 错误，除非该模式要求删）；专项搜索改写后最易存活的 5 tell：not-X-but-Y、单行收尾、破折号、三段式、粗体标签。
4. **定稿**：自然陈述每一点而非逐条打补丁；段落围绕主点重写；长短句交替。

### 1.4 Voice matching

给样本先读样本，匹配句长、用词、标点、开头、过渡。**样本覆盖模式表**（如样本用破折号，保留相近比例）。无样本时按文体取声音：博客/随笔/观点保留不确定性、混合感受、幽默、离题，可加反应；参考/技术/法律/事实类保持中性朴素。

### 1.5 事实保真（移植时最重要的纪律）

- 受支持的主张一个不少；不支持的主张一个不加。
- 意见/反应可加（声音要求时），事实主张不可加。
- 丢失主张 = 错误，除非模式要求删除（如§13 结尾段、§22 聊天残留）。
- 引语、标题、专名、讨论该短语本身的段落内不动手（「When not to act」）。

### 1.6 对 v2 的可移植点

- 强度排序（S1 式「单次即改」清单）与 weak-alone 陪伴规则 → 检测器的 severity 模型。
- §12 AI 词表（约 40 词）→ 翻译成中文词表的第一批来源。
- 四步流程 → 改写器 prompt 结构。
- 五残留专项校验 → 改写后校验清单。

---
---

## §2 op7418/Humanizer-zh

来源：`D:\Temp\deep-ai-taste\op7418_Humanizer-zh\SKILL.md`（485 行）。blader/humanizer 的中文翻译版，参考 hardikpandya/stop-slop。**注意：其示例改写会添加原文没有的细节（见 §2.3），移植时以 blader 的事实保真约束为准。**

### 2.1 24 个中文模式（按 4 组）

**内容模式（6）**：① 过度强调意义/遗产/趋势（作为/标志着/见证了/是…的体现/关键转折点/不断演变的格局）；② 过度强调知名度/媒体（独立报道/由知名专家撰写/活跃的社交媒体账号）；③ -ing 肤浅分析（突出/强调/反映/象征/为…做出贡献）；④ 宣传广告语（拥有/充满活力/坐落于/位于…中心/开创性/必游之地/迷人）；⑤ 模糊归因（行业报告显示/专家认为/一些批评者认为）；⑥ 提纲式「挑战与未来展望」段。

**语言语法（6）**：⑦ 过度 AI 词（此外/与…保持一致/至关重要/深入探讨/强调/格局/关键/展示/宝贵/充满活力）；⑧ 系动词回避（作为/代表/标志着/充当）；⑨ 否定式排比（不仅…而且/这不仅仅是…而是）；⑩ 三段式；⑪ 刻意换词（同义词循环，AI 重复惩罚导致）；⑫ 虚假范围（从 X 到 Y，X/Y 不在有意义尺度上）。

**风格（6）**：⑬ 破折号过度；⑭ 粗体过度；⑮ 内联标题垂直列表（粗体标签+冒号）；⑯ 标题大写（**中文不适用**，见下）；⑰ 表情符号；⑱ 弯引号（**中文反转**，见下）。

**交流/填充（6）**：⑲ 协作交流痕迹（希望这对您有帮助/当然！/请告诉我）；⑳ 知识截止免责（截至/根据我最后的训练更新）；㉑ 谄媚语气（好问题！您说得完全正确）；㉒ 填充短语（为了实现这一目标→为了实现这一点/在这个时间点→现在/值得注意的是数据显示→数据显示）；㉓ 过度限定（可以潜在地可能被认为…→该政策可能会影响结果）；㉔ 通用积极结论（公司的未来看起来光明→该公司计划明年再开两个地点）。

### 2.2 中文特有处理

- **标题大小写（⑯）**：中文标题不涉及大小写，此模式在中文中不适用。
- **弯引号（⑱）**：中文正常用中文引号（「」或""），AI 味表现为使用**英文引号**（""）。检测方向与英文相反。
- **填充短语表（㉒）**：提供 6 组中文「AI 填充 → 自然」映射，可直接进替换表。

### 2.3 与原版差异（⚠️ 移植注意）

- **事实保真弱化**：多处示例改写添加了原文没有的细节。例如内容模式②改写后「在 2024 年《纽约时报》的采访中，她认为…」（原文无此采访信息）；④改写后「以其每周集市和 18 世纪教堂而闻名」（原文无）；⑥改写后「2015 年三个新 IT 园区开业后…市政公司于 2022 年启动了雨水排水项目」（原文无这些具体事实）。**这些是反例**——移植时必须采用 blader 的「不添加来源没有的事实」约束。
- 质量评分表（50 分制）可移植：直接性/节奏/信任度/真实性/精炼度各 10 分，45-50 优秀、35-44 良好、<35 需重写。这是四个项目里唯一的显式评分表。

### 2.4 对 v2 的可移植点

- 中文 AI 词表、填充短语映射表、检查清单（连续三句同长？段落单行收尾？揭示前破折号？「此外/然而」连接词？三段式？）。
- 50 分评分表 → 改写质量评估维度。

---

## §3 Nanako0129/sepia v0.9.0

来源：`D:\Temp\deep-ai-taste\Nanako0129_sepia\skills\sepia\`（SKILL.md + 15 个 references）。工程化程度最高、证据标注最严谨的项目（每个数字标注来源与「是测量还是推断」）。

### 3.1 文体分层路由

| 文本类型 | 加载（按序） |
|---|---|
| 小说/叙事/叙事散文 | narrative-pass → discourse-pass → style-pass；用 rubric 诊断 |
| 发布说明/changelog/公告 | professional-pass + domains/release-notes |
| PR 回复/issue 回复/评审意见 | professional-pass + domains/dev-replies |
| 事故复盘/RCA | professional-pass + domains/postmortems |
| 工单/缺陷报告 | professional-pass + domains/tickets |
| 技术文章/博客/教程 | professional-pass + domains/tech-articles + discourse-pass §1-3 |
| 其他散文 | professional-pass + style-pass |

**中文**：目标文本为中文时，在 style-pass 步骤额外加载 `languages/zh.md`，它只校准 style pass 不改变路由。

### 3.2 四操作

| 操作 | 契约 |
|---|---|
| write | 新内容；先读 domain 文件再起草（架构/语域决策先行，事后补成本高） |
| review | 只诊断不改；产出缺陷清单（小说用 rubric 报告，专业用带引证证据的清单）即停 |
| refactor | 最小就地修订，保留结构/声音/意图。**两阶段：先完整缺陷清单，再逐条修，最深一层优先**。编辑比例偏向 replace/delete 而非 insert（实测编辑比例 **74/18/8**） |
| recreate | 全文重写；先把事实/主张/意图抽成裸清单，验证没编造，再在 domain 规则下重写 |

**两阶段协议不可省**：不先出缺陷清单就改写会让 AI 指纹更明显（专家检测器实测）。

### 3.3 三层 pass

**Pass 1 叙事架构（narrative-pass）**：7 个决策组（主题处理/副线/结局驱动/结局模式/时间结构/揭示节奏/情感策略/主角引入/道德立场/现实锚点/网络形状/稀有动作）。每个决策组给「人类 vs AI」实测差距 + 生成时怎么做 + 修订时查什么。关键：**每篇只实施 3-5 个人性化动作**（校准原则「选择不累积」）。StoryScope 叙事分类器 93.2% macro-F1，30 特征 XGBoost 84.8%（AUPRC .828）。

**Pass 2 话语流（discourse-pass）**：QUD 检查（每段隐含回答一个问题）；大纲测试（每段首句连读若构成清晰摘要 = 机器形状）；中部是咽喉点（AI 在正文最易识别，开头结尾模仿得好）；位置 tell（段落长度均匀、引语总在段尾、列举总三项、转场同一公式、强调均匀分布）。

**Pass 3 表层风格（style-pass）**：7 个人工编辑产物（按专业编辑实际修复频率排序）+ 句法模板 + 词表 + 句长方差 + 朗读测试 + 误报白名单。见 §3.4-3.6。

### 3.4 句长方差算法（style-pass §5，v2 最缺的检测维度）

**核心：均值不是信号，SD 才是。**

实测（四个研究、两代模型、两种语言一致方向）：LLM 输出句长的**展布**（within-paragraph SD、相邻句长差）比人类小。中文 HC3（朱君輝 et al. CCL 2023）：**句长 SD 人类 9.248 vs ChatGPT 6.729（词）；15.150 vs 12.842（字）**——两种单位差距都成立。均值方向随计数单位翻转（词：人类更长 25.067 vs 21.823；字：人类更短 40.893 vs 42.396），所以**长度均值不是信号**。

**检测（sepia 推断）**：找 3 个或以上相邻近似等长句（±20%）的连续段。这是 within-text 形式；只在与其他命中叠加时才算候选信号（slop 是累积的）。不按长度阈值给段落打分（尾部比率是语料级、按 token 测的，无法推导每段阈值）。需要至少段落长度的连续散文；单行回复/列表/表格/commit 式发布说明无节奏可测，报告 `none`。

**修复**：**移动词而非添加词**（74/18/8 规则）——拆一个长句、并两个短句、删一个从句。方向由文本决定：长句连串想要一个短句，短句连串想要一个长句。**不要全部缩短**——全短句是同一缺陷的另一面（pastiche）。

### 3.5 zh.md 中文校准（HC3 实测）

| 特征 | 人类 | ChatGPT | 单位 |
|---|---|---|---|
| 句长 SD | 9.248 | 6.729 | 词；字 15.150 vs 12.842 |
| 句长均值 | 25.067 | 21.823 | 词（字方向翻转 40.893 vs 42.396） |
| 段落数/回答 | 1.442 | 3.681 | ChatGPT 段落更多 |
| 标点密度 | 0.135 | 0.136 | 非信号 |
| **语气词密度** | 0.016 | 0.003 | **人类 5 倍** |
| **连词密度** | 0.013 | 0.036 | 「和」4.13 vs 11.76/回答 |
| 代词密度 | 0.052 | 0.069 | 第二人称 0.010 vs 0.021 |
| 单音节词占比 | 0.483 | 0.379 | 双音节 0.445 vs 0.532 |
| 型例比 TTR | 0.725 | 0.543 | 实词丰富度 0.822 vs 0.647 |
| 平均依存距离 | 3.900 | 3.659 | 最长 29.452 vs 23.991 |

**中文要猎的**：连词堆叠（和/以及/并且/同时/此外/因此/然而 跨从句链式，「和」连接整句而非名词——中文意合是默认，删连词让并置承担连接）；散文中的第二人称（「你会发现」「您可以」）；**双音节填充**（进行讨论→讨论、加以说明→说明、予以处理→处理、做出决定→决定，动词单独即可）；句长扁平（SD 6.729 vs 9.248，用 §5 检查）。

**中文要恢复的**（按语域允许，撒不是浇）：句尾/句中语气词（啊、吧、呢、嘛、喔、啦、耶）——§1 最大差距；单音节动词/形容词；句长展布；主语省略与口语缩略。正式场合保持语域（法律通知不加「嘛」）。

**中文非信号**：标点密度/逗号句号计数（矛盾测量）；按词计的长句（人类更长）；段落数（ChatGPT 分更多，与「AI 写一大块」的民间说法相反）；词频层级（两个语料两个时代无规则）。

### 3.6 模型指纹（model-fingerprints.md）

叙事层（实测，StoryScope）：Claude 26 个指纹（最可识别）、GPT 流言机制/远距回顾、Gemini 整洁结局、DeepSeek 前置加载、Kimi 质心（指纹最少，居中即其 tell）。散文层（厂商文档，未测量，按版本标签生效/作先验）。人类指纹（正向目标）：主角对话中引入（最强单标记，uniqueness 21.4）、单一焦点视角、叙述者偶尔直接对读者、后置揭示节奏、跨界文学野心。

**对 v2 的意义**：模型指纹是「作者模型」维度的检测，v2 若已知来源模型可作先验；但**不要从文本推断模型**（68.4% 是训练分类器，阅读不是）。中文散文层无厂商数据，此层对 v2 中文场景价值有限。

### 3.7 校准原则（治理所有规则）

| 原则 | 含义 |
|---|---|
| 瞄准区间不是相反极 | 人类值是中等（时间不连续 2.4/5 不是 5）。反转每个 AI tell 会造出新指纹 |
| 选择不累积 | 小说每篇 3-5 个动作；专业只修清单实际标记的 |
| 留 slack | 普通句子、未展开的想法、朴素段落；不要打磨每个表面 |

### 3.8 对 v2 的可移植点

- 句长方差检测（§3.4）+ 中文 SD 数值（§3.5）→ v2 缺失的节奏检测器。
- 中文语气词/连词/双音节填充校准数值 → 检测与恢复的量化基线。
- 四操作与两阶段协议 → v2 的改写流程结构。
- 误报白名单（style-pass §7）→ 防误报清单。

---

## §4 epoko77-ai/im-not-ai v2.3.2

来源：`D:\Temp\deep-ai-taste\epoko77-ai_im-not-ai\skills\humanize-korean\`（SKILL.md + ai-tell-taxonomy.md 932 行 + Python 脚本）。韩语项目，工程化最完整，是 v2 升级的最佳模板。

### 4.1 分类体系：10 大类 × 70+ 子模式（SSOT）

| 类 | 名称 | 子模式数 | 代表 |
|---|---|---|---|
| A | 翻译腔 | A-1~A-24 | 对/关于、通过、在…方面、基于、拥有、双被动、被动、可以、为了、名词罗列、抽象主语+万能动词、代词直译、关系从句左向修饰、双助词 |
| B | 英语引用/术语过多 | B-1~B-4 | 括号并写、广告 buzzword、过多英语引文、known as |
| C | 结构性 AI 模式 | C-1~C-12 | 机械并列、过多 bullet、重复标题、段落首句摘要、emoji、标题下摘要框、段落三连公式、**对称对仗**、数字括号索引、冒号副题、连接词后逗号、逗号包含率 |
| D | AI 特有惯用语 | D-1~D-14 | 结论/总结、意义夸大、枚举导入、hype 词、拟人抽象主语、完成式结尾、转换公式、分裂句、因果结论、反向结论、模糊时间地平、空反驳槽、散文反思副词、生成性隐喻 |
| E | 节奏/句长均匀 | E-1~E-7 | 句长 SD 低、同结尾、段落 3-4 句公式、单句一边倒、逗号分节平均长、逗号前后 POS 多样性、听者敬语一致性 |
| F | 过度修饰/重复 | F-1~F-5 | -ing 拖尾、冗余、抽象名词化、名词化后缀、~적 N 链 |
| G | 过度 Hedging | G-1~G-3 | 推测/观察型结尾、双重/三重委婉、安全平衡 lexicon |
| H | 连接词滥用 | H-1~H-4 | 句首连接词、하지만/그러나 混用、이는 指示重复、즉 再定义 |
| I | 形式名词/依赖名词过多 | I-1~I-6 | 것이다 结尾、점/바/수/데 重复、~라는 것、~할 필요가 있다、~이/가 필요하다、~능력 链 |
| J | 视觉装饰滥用 | J-1~J-4 | 过度加粗、过度引号、破折号、括号补充 |

（A-17 为 hold 状态，ID 保留未用；A-20~A-24 为 v2.6/v2.7 新增，实际子模式数 > 70。）

### 4.2 严重度机制 S1/S2/S3

- **S1 决定性**：出现一次几乎可断定「这是 AI」，无条件移除。
- **S2 强**：1-2 次自然，文档 3 次以上重复才留痕，**密度驱动**移除。
- **S3 弱**：单独不是问题，与其他叠加时强化 AI 感，节奏调整级别。

**severity_weighted_score = S1×5 + S2×2 + S3×0.5**，归一化到 0-100。`ai_tell_density` = 检测 span 总字数/总字数。

### 4.3 检测 JSON 契约（Detector → Rewriter 共享）

```json
{
  "meta": { "input_length": 1820, "detected_count": 37, "ai_tell_density": 0.203, "severity_weighted_score": 71.5 },
  "findings": [
    { "id": "f001", "category": "A-2", "category_label": "번역투: ~를 통해 남발",
      "severity": "S1", "text_span": "데이터 분석을 통해", "start": 142, "end": 153,
      "reason": "'통해'가 본문에서 6회 반복되어 경로 서술이 기계적", "suggested_fix": "데이터를 분석해서" }
  ],
  "category_summary": { "A": 12, "B": 3, "C": 2, "D": 8, "E": 1, "F": 4, "G": 2, "H": 3, "I": 1, "J": 1 }
}
```

span 带 start/end 偏移，改写器按 span 定位，不整句重写。这是 v2 检测器应输出的契约。

### 4.4 反注入护栏（最值得移植的工程实践）

**核心发现：改写器会制造新的 AI 味。** 实测逆注入：

- **C-11 连接词后逗号**：28 篇污染对中 16 篇改写后连接词后逗号反而增加（2→3、4→7）。原因：编辑模型重写时用英语逗号感。
- **C-8 对仗**：17 篇改写后总量 66→55 减少，但**出现文档从 12→14 增加**——原 0 对仗的 2 篇（结论/再定义句）被新造。规则「keep one」执行时在别处制造新对仗。
- **D-9/D-10 结论句式**：改写后「결국」「이유다」从 2→4、0→2 逆注入。

**护栏（确定性脚本，非 LLM 自报）**：
- `restore_modality.py`：把改写后丢失的委婉/义务标记的句子，从原句恢复（LLM 0 调用）。
- `strip_injected_commas.py`：只删改写器新写句子里的连接词后逗号，原句不动（保护作者逗号）。
- 原则：**改写后计数 ≤ 原文**；C-11 若改写后比原文多即失败，重写该句。

### 4.5 4 轴验证门（verify_gates.py）

| 轴 | 检查 | 判定 |
|---|---|---|
| 目标达成 | S1 目标是否移除 | 未达成 → exit 1 |
| 对仗全灭 | before>=5 AND after==0 | FAIL（过度校正） |
| 变更率 | Levenshtein 字符率 | 30-50% 警告(exit1)，≥50% 中止(exit2，禁止采纳) |
| golden + 数值 | 金标测试 + 数值门 | FAIL → exit 1 |

exit 0 收敛通过 / 1 警告（finalize 升级）/ 2 中止（回滚重跑 1 次，仍 2 则 hold_and_report）/ 3 无法判定。**字符率是 SSOT**，不信任 LLM 自报变更率（实测 2.77% 字符率背后隐藏 29.7% 句触率 + 对仗 -75%）。

### 4.6 人类基线反转（防误报关键）

多个「公认 AI 味」模式实测人类用得更多，默认保留：

- **A-1「对/关于」**：人类 4.39 vs AI 1.46/千词（人类 3 倍，60 篇中 23 篇）。仅当一段 3 次以上密集才部分直连。
- **A-2「通过」**：非翻译韩语 84.4 vs 翻译 42.1（人类 2 倍）。仅重复使用才分散。
- **A-11「为了」**：人类 1.29 vs AI 0.85（人类更多）。默认保留。
- **I-1「것이다」结尾**：AI 20.4 vs 人类 43.0/千句（人类 2 倍）。仅连续 3+ 才部分改。
- **A-16 代词**：总量人类 2.5 倍，但「无先行词使用」AI 6 倍——**按位置判定不按频率**（见 §7 伪代码）。

**结论：密度驱动 + 人类基线反转，是 v2 从「无条件替换」升级的关键。**

### 4.7 路由分级（成本控制）

| 路径 | LLM 调用 | 目标 |
|---|---|---|
| light | 1（失败时 2） | 好文章——词汇 tell 0、结构 tell 轻微；保守强度 |
| standard | 2（升级时 3） | 普通 AI 草稿：诊断 1 次 + 单次改写 |
| heavy | 3+（分块时 2+N+1） | 重症 slop/超长/需证据：诊断→定向改写→finalize |

**单次调用优先**：实测 1 万字分块 7 调用 610K token vs 单次 134K，质量等同（爆炸主因是每块重载规则/诊断）。输入长度不改变路径。

### 4.8 改写手册 7 原则（rewriting-playbook）

1. 意义不变；2. 语调匹配；3. 局部性（只改 span）；4. 自然优先；5. 基于 span；6. 过度润色警报（变更率 50% 中止）；7. **只删不加**。

### 4.9 诊断观测指标（不可处方，防误报专用）

- DS-2 空中引用（无情境的匿名来源）——处方不可（编情境=编造），仅警告「需核实来源」。
- DS-4 说话者自我介入缺失——「说实话/我不知道/依我看」人类 13 件/11 篇 vs AI 99 篇 0 件。**反向指标**：有此标记 = 人类加分。⚠️ blader §4 把英文 "Honestly?" 当 AI tell，韩语中正相反——语言差异。
- DS-6 情绪尖峰缺失（嘲讽/惊叹）人类 13 vs AI 0——反向指标，不可注入。
- DS-1 无时间开头——唯一可部分处方：把正文已有的日期事实/引文**移动**到开头（移动专用，不编新时间）。
- DS-5 警句结尾——结尾结算标记率人类 7% vs AI 28-51%。

### 4.10 对 v2 的可移植点

- 10 大类分类体系 + S1/S2/S3 严重度 + severity_weighted_score → v2 检测器骨架。
- span JSON 契约 → 检测器输出格式。
- 反注入护栏（restore_modality / strip_injected_commas 思路）→ v2 改写后确定性校验。
- 4 轴验证门 → v2 的验证层。
- 人类基线反转 → 防误报规则。
- 3 级路由 + 单次调用优先 → v2 的成本控制。

---
---

## §5 与 v1 引擎逐项对比

v1 引擎：`packages/rewrite-engine/src/ai-taste-remover.js`（191 行）。v2 编排：`rewrite-engine-core.js` 的 `_postProcess` 在 LLM 输出后调用 `AITasteRemover`（intensity=2, tone=casual）。

### 5.1 差距表（14 维度）

| 维度 | v1 现状 | 四项目最佳实践 | 差距 |
|---|---|---|---|
| 检测模型 | 词表替换 + 开头正则 + 平均句长 | im-not-ai：10 类 × 70+ 模式 + S1/S2/S3 严重度 + severity_weighted_score | 无分类、无严重度 |
| 密度概念 | 无（「此外」1 次和 10 次同分） | S2 密度驱动（3 次以上才动） | 缺密度阈值 |
| 内容锚 | 无（正则替换可能破坏引文/专名） | im-not-ai 内容锚（核心名词原形必须保留）+ blader 引语/专名不动 | 缺内容锚保护 |
| 防误报 | 无（引语内「众所周知」也被删） | im-not-ai 人类基线反转 + sepia 误报白名单 | 缺防误报 |
| 结构模式 | 无 | blader §1-5（否定排比/金句/格言/铺垫/空辩论）+ im-not-ai C-8/D 类 | 缺结构模式 |
| 节奏检测 | 仅平均句长（60/8 阈值） | sepia 句长 SD + 3 连等长句；im-not-ai E 类 | 均值非信号，需 SD |
| 改写方式 | 词表机械替换 + 随机拆句 | LLM 改写（im-not-ai/sepia）+ span 定向 | 机械替换破坏语义 |
| 随机性 | `Math.random()` 拆句/口语化 | 无随机；改写是确定性/LLM 决策 | 随机=不可复现 |
| 验证 | 无（改写后不检查新 AI 味） | im-not-ai 4 轴验证门 + 反注入护栏 | 缺验证层 |
| 诊断 | 无（直接改） | im-not-ai diagnostician 先诊断；sepia 两阶段协议 | 缺诊断阶段 |
| 路由 | 无（固定 intensity=2） | im-not-ai 3 级路由 + 单次调用优先 | 缺成本路由 |
| 人类基线 | 无 | im-not-ai A-1/A-2/A-11/I-1 反转 | 缺人类基线 |
| 中文校准 | 无 | sepia zh.md（语气词/连词/双音节填充数值） | 缺中文数值 |
| 事实保真 | 词表替换不改事实（但随机拆句破坏语义） | blader「不加不丢」+ im-not-ai「只删不加」 | 拆句破坏语义 |

### 5.2 v1 引擎 7 条缺陷（对照四项目）

1. **随机句长拆分破坏语义**：`_randomizeSentenceLength` 按逗号拆 >80 字句子并随机加「。」/「，」。因果句「因为 A，所以 B」可能拆成病句，且随机不可复现。sepia 明确「移动词而非添加词」，im-not-ai 明确「只删不加」。
2. **无密度概念**：`_replaceAIPhrases` 对每个词表项全局替换，1 次和 10 次同分。im-not-ai S2 要求 3 次以上才动。
3. **无内容锚**：正则替换可能命中引文、专名、代码内的词。blader「When not to act」明确引语/标题/专名不动。
4. **无防误报**：引语内「众所周知」也被删。im-not-ai 人类基线反转证明「众所周知」类表达人类也用。
5. **无结构模式**：否定式排比、三段式、金句收尾、铺垫开场、空辩论全没覆盖（blader §1-5、im-not-ai C-8/D 类）。
6. **无验证**：改写后不检查是否制造新 AI 味。im-not-ai 实测改写器逆注入（C-11 16/28 篇）。
7. **无诊断**：im-not-ai 证明先诊断后改写效果显著（standard/heavy 固定 diagnostician）；sepia 两阶段协议不可省。

---

## §6 推荐实现方案（P0-P5 优先级）

> 每项标注来源、工作量、依赖。总工作量约 5-6 天（见 §8）。

### P0：检测器重构（检测优先于改写）——来源 im-not-ai §4.1-4.3 + blader §1.2
- 建中文 AI 味分类体系（先 6-8 类：翻译腔/结构/惯用语/节奏/修饰/装饰），每模式带 S1/S2/S3。
- 输出 span JSON 契约（id/category/severity/text_span/start/end/reason/suggested_fix）。
- severity_weighted_score + ai_tell_density。
- 工作量 1.5 天；依赖：无。

### P1：内容锚 + 防误报（保护人类文本）——来源 im-not-ai §4.6 + blader §1.5 + sepia §3.7
- 内容锚：改写前抽取核心名词/主张，结果必须保留原形至少一次。
- 人类基线反转表：对「此外/众所周知/值得注意的是」等先做语料验证，人类高频则降级为密度驱动。
- 误报白名单：引语/专名/代码块/讨论该短语本身的段落不动。
- 工作量 1 天；依赖：P0。

### P2：节奏检测器（句长方差）——来源 sepia §3.4-3.5
- 计算句长 SD，找 3+ 连近似等长句（±20%）。
- 中文用 zh.md 数值（SD 人类 9.248 vs AI 6.729 词）作校准参考。
- 修复 = 移动词不添加（拆长句/并短句/删从句）。
- 工作量 1 天；依赖：P0。

### P3：反注入护栏 + 验证门——来源 im-not-ai §4.4-4.5
- 改写后确定性校验：改写后计数 ≤ 原文；连接词后逗号不增；对仗不全灭（before>=5 AND after==0 FAIL）；变更率 30-50% 警告、≥50% 中止。
- 恢复脚本思路：把改写后丢失的委婉/义务标记从原句恢复。
- 工作量 1 天；依赖：P0/P1。

### P4：改写器升级（LLM 改写 + span 定向）——来源 im-not-ai §4.8 + blader §1.3
- 改写 prompt 加：内容锚保留、只删不加、按 span 局部修、不整句重写。
- 改写后跑 P3 验证。
- 工作量 0.5-1 天；依赖：P0-P3。

### P5：路由分级 + 诊断阶段——来源 im-not-ai §4.7 + sepia §3.2
- light/standard/heavy 3 级路由；单次调用优先。
- standard/heavy 先诊断（dominant 3-6 模式）再定向改写。
- 工作量 0.5-1 天；依赖：P0-P4。

---

## §7 可移植代码片段（中文）

### 7.1 中文检测正则（4 组）

```js
// 1. 否定式排比（blader §1 / op7418 ⑨ / im-not-ai C-8）
const NOT_X_BUT_Y = /(?:不仅仅?|不只是|不只是|不只是|不仅是|不单是|不只是)\s*[^。！？，,]{2,20}\s*(?:而是|而是说|而是因为|而)/g
// 2. AI 词（op7418 ⑦ / blader §12 中译）
const AI_WORDS = /(?:此外|与此同时|值得注意的是|不可否认|众所周知|总而言之|综上所述|毋庸置疑|显而易见|不言而喻|深入探讨|至关重要|不断演变|充满活力|开创性|必游之地)/g
// 3. 开场铺垫（blader §4 / op7418 ㉒）
const STAGED_OPENERS = /^(?:在当今社会|随着[^，,]+的发展|众所周知|近年来|当今时代|值得注意的是)[，,]/g
// 4. 连接词后逗号（im-not-ai C-11，中文对应）
const COMMA_AFTER_CONNECTIVE = /(?:但是|而且|然而|因此|所以|同时|此外)[，,](?=[^，,]{2,})/g
```

### 7.2 AITellDetector 伪代码（im-not-ai §4.3 契约）

```js
class AITellDetector {
  detect(text) {
    const findings = []
    let totalSpan = 0
    for (const pattern of PATTERNS) {           // 每模式带 severity + 密度阈值
      const hits = [...text.matchAll(pattern.regex)]
      if (hits.length >= pattern.densityThreshold) {  // S1 阈值=1，S2 阈值=3
        for (const m of hits) {
          findings.push({
            id: `f${++seq}`, category: pattern.id,
            severity: pattern.severity,
            text_span: m[0], start: m.index, end: m.index + m[0].length,
            reason: pattern.reason, suggested_fix: pattern.fix
          })
          totalSpan += m[0].length
        }
      }
    }
    const severityWeighted = findings.reduce(
      (s, f) => s + ({ S1: 5, S2: 2, S3: 0.5 }[f.severity] || 0), 0)
    return {
      meta: { input_length: text.length, detected_count: findings.length,
              ai_tell_density: totalSpan / text.length,
              severity_weighted_score: severityWeighted },
      findings, category_summary: groupBy(findings, 'category')
    }
  }
}
```

### 7.3 detectSentenceRhythm 伪代码（sepia §3.4）

```js
// 找 3+ 连近似等长句（±20%）；均值不是信号，SD 才是
function detectSentenceRhythm(text) {
  const sentences = splitSentences(text)          // 中文：按 。！？；分段
  if (sentences.length < 3) return { signal: false, reason: 'none' }  // 需段落长度
  const lens = sentences.map(s => s.length)
  let runs = 0, maxRun = 0
  for (let i = 1; i < lens.length; i++) {
    const prev = lens[i-1], cur = lens[i]
    const nearEqual = Math.abs(cur - prev) <= prev * 0.20   // ±20%
    runs = nearEqual ? runs + 1 : 0
    maxRun = Math.max(maxRun, runs + 1)
  }
  const sd = stddev(lens)
  return { signal: maxRun >= 3, maxRun, sd,
           note: 'SD 人类 9.248 vs AI 6.729(词) 仅作校准参考，非阈值' }
}
```

### 7.4 反注入护栏伪代码（im-not-ai §4.4）

```js
// 改写后确定性校验：改写器会逆注入新 AI 味，必须用规则校验，不信任 LLM 自报
function antiInjectionGuard(original, rewritten) {
  const checks = {
    connectiveComma:  // 连接词后逗号：改写后 ≤ 原文
      count(rewritten, COMMA_AFTER_CONNECTIVE) <= count(original, COMMA_AFTER_CONNECTIVE),
    antithesisNotAnnihilated:  // 对仗：before>=5 时 after 不得为 0（过度校正）
      !(count(original, NOT_X_BUT_Y) >= 5 && count(rewritten, NOT_X_BUT_Y) === 0),
    modalityPreserved:  // 委婉/义务标记：改写后 ≥ 原文（恢复丢失的）
      count(rewritten, MODALITY_MARKS) >= count(original, MODALITY_MARKS),
    changeRate:  // 变更率：30-50% 警告，≥50% 中止
      levenshtein(original, rewritten) / original.length
  }
  if (checks.changeRate >= 0.5) return { pass: false, reason: 'change_rate_too_high', checks }
  if (checks.changeRate >= 0.3) return { pass: true, warn: true, checks }
  return { pass: Object.values(checks).every(Boolean), checks }
}
```

### 7.5 ZH_FILLER_MAP 替换表（op7418 ㉒ + v1 词表合并）

```js
const ZH_FILLER_MAP = {
  '为了实现这一目标': '为了实现这一点',
  '由于下雨的事实': '因为下雨',
  '在这个时间点': '现在',
  '在您需要帮助的情况下': '如果您需要帮助',
  '系统具有处理的能力': '系统可以处理',
  '值得注意的是数据显示': '数据显示',
  '综上所述': '说到底', '值得注意的是': '有个细节很有意思',
  '不可否认': '说实话', '在当今社会': '现在', '随着社会的发展': '这些年',
  '首先': '第一', '其次': '第二', '最后': '再来说', '总而言之': '一句话',
  '此外': '还有', '与此同时': '同时', '毋庸置疑': '毫无疑问',
  '显而易见': '很明显', '众所周知': '大家都知道', '不言而喻': '不用多说',
}
// ⚠️ 使用前先做人类基线验证（im-not-ai §4.6）：这些词若人类也高频，降级为密度驱动而非无条件替换
```

### 7.6 结构模式改写方向（blader §1-5 / im-not-ai C-8）

| 结构模式 | 检测 | 改写方向 |
|---|---|---|
| 否定式排比 | 不仅仅…而是… | 直接陈述；仅当否定半句纠正真实信念才保留 |
| 单行金句收尾 | 段尾单句复述前段 | 删除重复收尾 |
| 假装深刻格言 | 真正的…是 / 核心在于 / 本质是 | 换成具体主张 |
| 开场铺垫 | 让我们深入 / 这里你需要知道 | 移除铺垫本身 |
| 空辩论 | 我不是说…/ 需要澄清的是 | 删防御；有主张则陈述 |

---

## §8 移植优先级与工作量估算

| 优先级 | 内容 | 来源 | 工作量 | 依赖 |
|---|---|---|---|---|
| P0 | 检测器重构（分类 + 严重度 + span 契约） | im-not-ai §4.1-4.3 | 1.5 天 | 无 |
| P1 | 内容锚 + 防误报 + 人类基线 | im-not-ai §4.6 / blader §1.5 | 1 天 | P0 |
| P2 | 节奏检测器（句长方差） | sepia §3.4-3.5 | 1 天 | P0 |
| P3 | 反注入护栏 + 验证门 | im-not-ai §4.4-4.5 | 1 天 | P0/P1 |
| P4 | 改写器升级（LLM + span 定向） | im-not-ai §4.8 / blader §1.3 | 0.5-1 天 | P0-P3 |
| P5 | 路由分级 + 诊断阶段 | im-not-ai §4.7 / sepia §3.2 | 0.5-1 天 | P0-P4 |
| **合计** | | | **约 5-6 天** | |

---

## §9 证据边界与存疑点

1. **sepia 数值是单语料方向参考**：句长 SD（9.248 vs 6.729 词）来自单一中文语料（HC3-Chinese，2023 年 GPT-3.5 时代，6,586 对问答）。sepia 自己标注「每个数字是观察过一次的方向，不是校准常数」。2024-2026 模型的中文叙事/说明散文无测量。
2. **im-not-ai 数值是韩语，需中文基线**：A-1/A-2/A-11/I-1 的人类基线反转、C-8 对仗 9.2 倍、C-11 连接词后逗号 4.84 倍，全部基于韩语语料。中文需重建基线（sepia zh.md 提供部分中文数值：连词密度、语气词、双音节填充）。
3. **op7418 事实保真弱**：其示例改写添加原文没有的细节，是反例。移植时以 blader「不加不丢」为准。
4. **blader 无代码**：纯文本规范，无检测/改写实现。其价值在模式清单与纪律，算法需自行实现。
5. **模型指纹时效性**：sepia 的模型指纹（Claude 26 指纹等）标注「valid as of 2026」且基于特定版本（Sonnet 4.6、GPT-5.4 等）。中文散文层无厂商数据。v2 若用此层需注意版本漂移。
6. **A-17 hold**：im-not-ai 的 A-17（无生物/抽象名词复数标记）因外部语料阳性 0 件而 hold，ID 保留未用。移植时不要把它当有效模式。
7. **Python 脚本未逐行读**：im-not-ai 的 `verify_gates.py`、`restore_modality.py`、`strip_injected_commas.py`、`metrics_v2.py` 的具体实现未逐行精读，本文档只移植了其接口与判定逻辑（§4.4-4.5、§7.4）。若需精确移植需再读源码。

---

## §10 四个项目文件地图

| 项目 | 关键文件 | 说明 |
|---|---|---|
| blader/humanizer | `SKILL.md`（375 行） | 唯一文件，纯文本规范 |
| op7418/Humanizer-zh | `SKILL.md`（485 行） | 唯一文件，中文翻译版 |
| sepia | `skills/sepia/SKILL.md` + `references/`（15 文件） | SKILL（路由/操作/校准/护栏）+ narrative-pass + discourse-pass + style-pass + professional-pass + rubric + zh.md + model-fingerprints + voices/ + domains/ |
| im-not-ai | `skills/humanize-korean/SKILL.md` + `references/ai-tell-taxonomy.md`（932 行） + `scripts/*.py` | SKILL（3 级路由/验证门/反注入）+ taxonomy（SSOT 分类体系）+ scripts（shim/verify_gates/restore_modality/strip_injected_commas/metrics） |

---

## 附：四条总纲结论回顾

1. **检测器优先于改写器**——im-not-ai 与 sepia 都以「先诊断后改写」为骨架，v1 直接盲改是最大结构性缺陷。
2. **反注入护栏是硬需求**——改写器会逆注入新 AI 味（C-11 16/28 篇、C-8 12→14 篇、D-9/D-10 2→4 与 0→2），改写后必须做确定性校验。
3. **人类基线反转是防误报关键**——多个「公认 AI 味」模式人类用得更多，v1 无条件替换会损坏人类文本。
4. **LLM 改写 + 规则验证混合**——四个项目没有一个用纯规则完成改写；v2 已有 LLM 编排，缺的是「规则检测器 + 确定性验证门」两个外围件。