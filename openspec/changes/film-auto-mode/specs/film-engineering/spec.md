# film-engineering

影视工程流水线（`film-engineering`）在既有「画布 + 工程案例」之上新增**自动模式**，并把三条动线重组为**三标签 Hub**。字段级规格（控件、取值范围、默认值、文案中英对照、错误码）以 `01-docs/PRD-FILM-AUTO-MODE-2026-10-09.md` 为单一来源；本文件只承载可被测试校验的行为合同。

## ADDED Requirements

### Requirement: 影视工程三标签导航契约

`/film-engineering` SHALL 渲染三标签 Hub：第 1 标签「自动」（新增自动模式）、第 2 标签「画布」（既有 `FilmCanvasView.vue`）、第 3 标签「工程案例」（既有 `FilmEngineeringView.vue`）。标签激活态 SHALL 与 URL query `?tab=auto|canvas|classic` 双向绑定，缺省 SHALL 为 `auto` 且 SHALL 以 `router.replace` 同步（不新增历史记录）。两个既有视图 SHALL 新增可选 `embedded` prop 且**默认值 `false` 时渲染结果与本次变更前逐字一致**；`embedded` 为 `true` 时 SHALL 隐藏其页面级标题（画布的品牌块、工程页的 h1+subtitle），画布工具栏跳转按钮 SHALL 改为触发切标签事件。`/film-engineering/classic` 路由 SHALL 保持为指向 `FilmEngineeringView.vue` 的非 redirect 路由（无标签直达页），SHALL NOT 引入 redirect（避免削弱 `useTabDocumentTitle.test.js` 的「非 redirect 路由数」棘轮）。

#### Scenario: 默认进入自动模式

- **WHEN** 用户从创建页选择影视工程进入 `/film-engineering`（无 query）
- **THEN** 第 1 标签「自动」为激活态，URL 被 replace 为 `?tab=auto`，画布与工程案例面板未挂载（懒挂载）

#### Scenario: 深链与刷新保持标签

- **WHEN** 用户直接打开 `/film-engineering?tab=classic` 或在该标签下刷新
- **THEN** 第 3 标签「工程案例」激活并渲染 `FilmEngineeringView.vue`

#### Scenario: 旧路由保留为无标签直达页

- **WHEN** 用户/既有文档访问 `/film-engineering/classic`
- **THEN** 直接渲染 `FilmEngineeringView.vue`（无标签壳，功能与 Hub 第 3 标签同源）；该路由仍为非 redirect 条目，`/film-engineering` 的 Hub 第 3 标签渲染同一组件

#### Scenario: 画布跳转按钮随上下文切换语义

- **WHEN** 画布在 Hub 内（`embedded=true`）点击工具栏按钮
- **THEN** 触发切标签事件并由 Hub 切到「工程案例」标签（不整页跳转）；独立路由下（`embedded` 未传）保持 `router.push('/film-engineering/classic')` 行为

#### Scenario: 切换标签不丢状态

- **WHEN** 用户在自动模式运行中（`running`）切到画布再切回
- **THEN** 自动模式面板仍显示相同进度（组件未被销毁重建），画布节点位置与连线保持不变

#### Scenario: embedded 默认不改变既有页面

- **WHEN** 既有测试以默认 props 挂载 `FilmCanvasView.vue` / `FilmEngineeringView.vue`
- **THEN** 品牌块 / h1+subtitle 照常渲染，全部既有断言通过

### Requirement: 自动模式输入与校验契约

自动模式 SHALL 只要求 5 项输入：剧本、人物参考图（可选）、场景参考图（可选）、画面方向、大概时长；另 SHALL 提供默认折叠的「单镜时长」高级项。校验 SHALL 前端与主进程双端执行且判据一致：剧本 `trim()` 后 1–10000 字；人物参考图 ≤8 张、场景参考图 ≤8 张、单张 ≤10MB 且仅 PNG/JPEG/WEBP（主进程 SHALL 以文件魔数嗅探为准，不信任客户端声明的 mime）；画面方向 SHALL 为 `16x9|9x16`；大概时长 SHALL 为 10–600 的整数秒；单镜时长 SHALL 为 `5|8|10`（默认 5）。

#### Scenario: 空剧本不可提交

- **WHEN** 剧本为空或仅空白字符
- **THEN** 提交按钮禁用且显示文案「请先输入剧本」；若经 IPC 直达，主进程返回 `AUTO_SCRIPT_EMPTY`

#### Scenario: 超长剧本被拦

- **WHEN** 剧本超过 10000 字
- **THEN** 前端显示红字上限提示并禁用提交；IPC 返回 `AUTO_SCRIPT_TOO_LONG`

#### Scenario: 假图片被拒

- **WHEN** 上传扩展名为 `.png` 但内容非 PNG/JPEG/WEBP 的文件
- **THEN** 主进程魔数嗅探失败，返回校验错误且不落盘

#### Scenario: 参数越界

- **WHEN** 大概时长为 9 或 601，或画面方向为 `source`，或单镜时长为 7
- **THEN** 校验失败（`AUTO_BAD_PARAM`），不产生任何 provider 调用

### Requirement: 自动模式规划契约

规划 SHALL 完全由程序完成且零 provider 调用：按「目标时长 ÷ 单镜秒数」四舍五入得到目标镜数 `N = clamp(round(T/s), 1, 120)`；单镜秒数 SHALL 为 `5|8|10`（默认 5）且在单次 run 内**全局唯一**（不得按比例缩放每镜秒数，既有阶段契约为阶段级参数）；段落数 `K < N` 时 SHALL 只做句级拆分（合并 SHALL NOT 在分场阶段发生），`K > N` 时 SHALL 只在时长规划阶段相邻合并至 `N`（合并=顺序拼接，不丢字）；实际时长 SHALL 为 `N × s` 并如实显示与目标时长的差异（SHALL NOT 承诺容差）；提示词 SHALL 复用 film-kit 模板块结构（`ScriptAdapter`/`buildTemplatePrompt`）而非新写组装逻辑；角色检出 SHALL 以「用户上传时标注的角色名」为最高权重，其次剧本显式标记、对话动词前名词、频次 ≥2 的候选名；检出为空 SHALL 以「角色1..N」占位并给出警告。

#### Scenario: 目标时长换算镜数

- **WHEN** 大概时长 120 秒、单镜时长 5 秒
- **THEN** 计划镜数为 24，确认卡显示「实际时长约 120 秒」

#### Scenario: 段落不足时句级补齐

- **WHEN** 剧本只有 1 个自然段而目标镜数为 6
- **THEN** 该段按句末标点切分为 6 个 beat，产出 6 个分镜

#### Scenario: 段落过多时合并

- **WHEN** 剧本有 20 个自然段而目标镜数为 6
- **THEN** 相邻段合并为 6 个 beat，不丢弃任何文本（合并后文本为各段顺序拼接）

#### Scenario: 超过上限拒绝

- **WHEN** 由目标时长换算出的镜数超过 120（`MAX_AUTO_SHOTS`，等于输入域上界 `round(600/5)`）
- **THEN** 返回 `AUTO_TOO_MANY_SHOTS` 并提示缩短时长或增大单镜秒数（该分支为 fail-closed 兜底，正常表单输入域内不可达）

#### Scenario: 角色名以用户标注为准

- **WHEN** 用户上传人物图并标注角色名为「小强」，剧本中该名出现
- **THEN** 该名进入角色映射（槽位优先级最高），对应分镜注入该图

### Requirement: 自动模式参考图绑定契约

人物参考图 SHALL 按「该镜文本或模板角色行命中角色名」注入，场景参考图 SHALL 按场景轮转 `sceneRefs[i % len]` 注入且同场景共享同一张；单镜注入总数 SHALL ≤2；注入路径 SHALL 位于受控媒体根内（越界拒绝且不读取内容）；provider 不在参考输入能力表内时 SHALL 不注入并给出警告，SHALL NOT 阻断出片。

#### Scenario: 命中角色才注入

- **WHEN** 某镜文本不含任何已标注角色名
- **THEN** 该镜不注入人物参考图（不猜测、不兜底）

#### Scenario: provider 不支持参考输入

- **WHEN** 默认视频 Provider 不在 `minimax / agnes-video / agnes-multimodal` 内
- **THEN** 确认卡显示警告「当前 Provider 不支持参考图输入，参考图将被忽略」，出片仍可继续（纯文本）

#### Scenario: 越界路径拒绝

- **WHEN** 参考图路径规范化后不在受控媒体根内
- **THEN** 该路径被拒绝且不读取文件内容，警告中标注 `outside-media-root`

### Requirement: 自动模式成本确认契约

自动模式 SHALL 只做**一次聚合确认**，且该确认为**清单式确认而非金额报价**（影视工程无视频单价表；既有 `costCheck` 同为清单式）：`auto-plan` 阶段 SHALL NOT 产生任何 provider 调用；`auto-start` 未携带 `confirmed === true` 时 SHALL 返回 `AUTO_NOT_CONFIRMED` 且 SHALL NOT 产生任何 provider 调用。确认卡 SHALL 至少显示：镜数、批数、单镜秒数、画幅、默认 Provider 标识、预计调用次数、参考图命中统计、磁盘预估、墙钟预估、实际时长与目标时长差异、警告清单、任务 ID（可编辑，路径安全）。

计划（`planId`）SHALL 由服务端生成并落盘，且 SHALL 与创建它的 `taskId` 绑定：`auto-start` SHALL 只接收 `{planId, taskId, confirmed, overwrite?}`，SHALL NOT 接受调用方传入的分镜或参考图路径；服务端 SHALL 读自己落盘的计划重建分镜，并逐项重校验参考图路径位于受控媒体根内。`planId` 不存在/过期/已消费 SHALL 返回 `AUTO_PLAN_EXPIRED`；`planId` 记录的 `taskId` 与入参不一致 SHALL 返回 `AUTO_PLAN_MISMATCH`；`taskId` 已存在且未显式 `overwrite=true` SHALL 返回 `AUTO_TASK_EXISTS`。

#### Scenario: 确认前零调用

- **WHEN** 用户完成规划但未点「确认并开始」
- **THEN** provider 调用计数为 0（单测以假 provider 断言），台账未创建

#### Scenario: 未确认的直达调用被拒

- **WHEN** 渲染端跳过确认直接调 `auto-start`（无 `confirmed`）
- **THEN** 返回 `AUTO_NOT_CONFIRMED`，零 provider 调用

#### Scenario: 客户端不得注入分镜与路径

- **WHEN** 调用方在 `auto-start` 载荷中夹带 `shots` 或 `refPaths`
- **THEN** 这些字段被忽略，实际分镜以服务端落盘计划为准；若计划内路径越出受控媒体根则该路径被拒绝并告警

#### Scenario: 计划归属校验

- **WHEN** 以 A 任务的 `planId` 搭配 B 任务的 `taskId` 调 `auto-start`
- **THEN** 返回 `AUTO_PLAN_MISMATCH`，零 provider 调用；孤儿或过期 `planId` 返回 `AUTO_PLAN_EXPIRED`

#### Scenario: 任务 ID 冲突

- **WHEN** `taskId` 已存在同名项目且未传 `overwrite=true`
- **THEN** 返回 `AUTO_TASK_EXISTS`，既有项目与产物不被覆盖

#### Scenario: 任务 ID 非法

- **WHEN** 任务 ID 含路径分隔符或超出 1–64 位 `[A-Za-z0-9._-]`
- **THEN** 返回校验错误，不创建项目文件

#### Scenario: 片段编辑后重生成必须先重新确认

- **WHEN** 用户编辑某镜提示词（`editedAt` 更新）后点击「重新生成该片段」，且此前确认早于本次编辑
- **THEN** 该通道先返回需重新确认，未确认前零 provider 调用；确认后追加一条 `confirmations[]` 记录再执行生成

#### Scenario: 累计重生成不绕过门槛

- **WHEN** 用户在同一确认下连续重生成多镜
- **THEN** 每次重生成前均以最新 `confirmations[]` 为基准判定；一旦发生编辑使 `editedAt > confirmedAt`，后续所有产生调用的通道都要求重新确认

#### Scenario: 确认历史只追加不覆盖

- **WHEN** 用户先后确认两次（中间发生过编辑）
- **THEN** `confirmations[]` 保留两条记录（含时间、载荷哈希、分镜指纹、计划版本），可作为「某次 provider 调用对应哪次确认」的审计依据

#### Scenario: 载荷与清单不一致时拒绝启动

- **WHEN** 当前清单哈希与最新确认记录的载荷哈希不一致
- **THEN** 拒绝启动并要求重新确认，零 provider 调用

#### Scenario: 调用计数对账

- **WHEN** 一个任务完成或续跑
- **THEN** `project.json` 的 `providerCalls` 与台账逐镜状态一致；不一致时在状态接口中如实暴露差值

### Requirement: 自动模式执行与续跑契约

确认后执行 SHALL 复用影视工程分批内核（批大小 10、台账 `.tmp`+rename、磁盘为真双核裁决、失败批隔离、事件节流 500ms）：`runOnlyBatch` SHALL 为空（连续跑完所有批），进度事件 SHALL 只携带计数/索引而不携带 shotIds 数组。同一任务 ID + 同一 `planId` 再次启动 SHALL 按项目文件指纹 + 磁盘复核续跑：磁盘已齐的镜 SHALL NOT 重复调用 provider；若项目文件记录的 `editedAt` 晚于 `confirmedAt`（期间发生过片段编辑或单镜重生成），续跑 SHALL 要求重新确认成本。单镜重生成的产物覆盖 SHALL 为原子写（`.part` → 校验 → rename）；磁盘缺失单镜 SHALL 只重生成该镜，SHALL NOT 使整份计划失效。

#### Scenario: 崩溃后原样续跑

- **WHEN** 12 镜任务在批 1 完成后进程退出，用户以同一任务 ID + 同一计划再次启动
- **THEN** 批 1 的 10 镜因磁盘产物齐全被跳过（零 provider 调用），仅继续批 2 的 2 镜

#### Scenario: 编辑后续跑要求重新确认

- **WHEN** 用户在中断后编辑过某镜提示词（`editedAt` > `confirmedAt`），随后续跑
- **THEN** 系统呈现「重新确认成本」卡，未确认前不产生任何 provider 调用

#### Scenario: 重生成原子落盘

- **WHEN** 单镜重生成过程中进程被杀
- **THEN** 仅残留 `.part` 临时文件，正式 `shot_NNN.mp4` 保持上一个完整版本（续跑不会把半写文件当作已完成）

#### Scenario: 磁盘缺单镜只补该镜

- **WHEN** 某镜产物被系统清理导致磁盘缺失，其余镜完好
- **THEN** 续跑只重生成该镜，不要求重新规划、不使整份计划失效

#### Scenario: 失败镜不中断后续

- **WHEN** 批内某镜生成失败
- **THEN** 该镜状态 `failed` 并记录可辨识原因，同批其余镜与后续批继续执行

#### Scenario: 批间停止

- **WHEN** 用户在运行中点「停止」
- **THEN** 当前镜完成后停止，不再启动新批；已完成产物与台账保留，可续跑

### Requirement: 片段编辑契约

成片前/后 SHALL 提供片段编辑：列表显示每镜序号、状态、提示词摘要、输出路径、时长与画幅；SHALL 支持编辑提示词（非空、≤50000 字符）、调整该镜参考图（受控媒体根校验）、调整该镜时长（`5|8|10`）、单镜重生成、失败镜重试、重新合成。单镜重生成 SHALL 以项目文件中的提示词**逐字符直送** provider（SHALL NOT 经提示词优化器），并覆盖 `shot_NNN.mp4`。片段 SHALL NOT 支持删除（成片合成要求 `orderIndex` 从 0 连续）。重新合成 SHALL 在任一镜磁盘产物缺失时 fail-closed 并列出缺失序号。

#### Scenario: 编辑后重生成使用新提示词

- **WHEN** 用户把某镜提示词改为 X 并点「重新生成该片段」
- **THEN** 提交给 provider 的 prompt 逐字符等于 X，磁盘 `shot_NNN.mp4` 被覆盖

#### Scenario: 未保存即重生成

- **WHEN** 用户编辑提示词后未点保存，直接点「重新生成该片段」
- **THEN** 系统先落盘该编辑再生成（不出现「改了没生效」的静默不一致）

#### Scenario: 缺镜时拒绝合成

- **WHEN** 片段列表存在状态非 done 的镜
- **THEN** 「重新合成」按钮禁用并显示缺失镜序号

#### Scenario: 提示词超限拒绝

- **WHEN** 用户把提示词改到 50001 字符
- **THEN** 保存失败（`AUTO_SHOT_INVALID`），原值不变

### Requirement: 自动模式进度展示契约

自动模式 SHALL 复用 `views/video-creation/StageProgress.vue` 展示进度，该组件 SHALL 新增 `testidPrefix` prop 且**默认值 `'story2video-stage'` 保持既有 DOM 契约不变**。进度数据 SHALL 以「事件推送优先 + 3000ms 轮询兜底」双通道获取，且 SHALL 以任务 ID 守卫丢弃不匹配的快照。

#### Scenario: 默认 testid 不变

- **WHEN** story2video 既有用法不传 `testidPrefix`
- **THEN** DOM 上仍为 `story2video-stage-*`，既有 `StageProgress.test.js` 与视觉基线通过

#### Scenario: 串扰快照被丢弃

- **WHEN** 收到 runId/taskId 与当前任务不匹配的进度快照
- **THEN** 该快照被忽略，界面继续显示当前任务进度
