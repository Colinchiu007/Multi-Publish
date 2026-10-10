# 技术调研报告：小宇宙播客平台接入可行性

- 日期：2026-10-09
- 类型：技术调研 / 选型（Phase 0.1，无代码变更）
- 问题：发布平台是否可能支持"小宇宙"？有无官方 API 或开放平台？市面产品与开源项目如何做的？在 mulpub 里怎么落地？

---

## 一、结论摘要（先行）

1. **小宇宙没有官方开放平台，也没有任何内容发布 API。** 官网页脚只有「主播后台」与客户端下载入口，无开发者/API/开放平台栏目（实测抓取）。
2. **小宇宙的发布模型是"RSS 收录"，不是"站内上传"。** 播客主必须先把音频托管在别处并生成标准 Podcast RSS（iTunes RSS 规范），首次在小宇宙提交 RSS 经人工审核收录后，**后续每期新节目由小宇宙自动拉取 RSS 同步**——即"发布到小宇宙"这件事本身不存在逐期操作，它是开放协议驱动的分发。
3. **「主播后台」是运营互动面板，不是上传后台。** 官方博客公布的功能为：节目信息编辑、语音回复、联系方式、公告、投票、听众名片、分享图——无音频上传/发布单集入口。
4. **市面上的"一键分发到小宇宙"全部走 RSS 机制**（播客托管平台生成 RSS → 播客主一次性提交小宇宙），而非小宇宙提供接口。通用图文/视频分发工具（融媒宝、易媒等，含某头部同类工具，其名称按本仓品牌纪律省略）的公开支持清单以小视频/图文平台为主，**未查到它们明确支持小宇宙逐期发布**。
5. **开源生态只有"读"没有"写"**：xiaoyuzhoufm-mcp、播客下载器等均为逆向 App 私有接口（手机号验证码登录 token），功能仅限搜索/详情/下载；未发现任何发布侧开源实现（因为没有发布 API 可对接）。
6. **推荐实现路径：把"发布到小宇宙"重定义为"发布为一个 Podcast RSS 频道"**（路径 A，协议分发通道）。这是唯一合规、稳定、可自动化的做法；配合一次性人工/RPA 辅助提交完成收录。逆向写接口（若未来发现）与 RPA 主播后台发布均不推荐作为主通道。

---

## 二、官方侧调研明细

### 2.1 有无开放平台 / API

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 官网 footer 开发者/开放平台/API 链接 | **不存在**，仅「主播后台」「点击下载」 | 实测抓取 xiaoyuzhoufm.com 首页 |
| 官方主播工具文档 | 官方博客（blog.xiaoyuzhoufm.com）有「主播后台」专栏，内容全部是运营互动功能，无接口文档、无上传功能 | 抓取 /tag/podcaster/ 与 /podcaster-manual/ |
| 「小宇宙上传节目」类教程 | 一致指向：小宇宙 App 无独立音频上传，需先有节目 RSS（托管在其他平台/自有存储），再在 App 内提交/等待收录 | 知乎、百度知道、ZOL 多篇教程交叉印证 |

**关键机制**：小宇宙是 RSS 聚合端（与 Apple Podcasts、Spotify 同层），不是内容托管端。音频文件、封面、show notes 全部来自播客主自己的 RSS feed。

### 2.2 收录与更新流程（现状）

```
[播客主] 制作音频 → 托管（自有 OSS / 第三方托管平台）→ 生成 Podcast RSS
    │
    ├─ 首次：在小宇宙 App 内「播客投稿/创建节目」提交 RSS 地址 → 人工审核收录（一次性）
    │
    └─ 此后：RSS 里新增 <item> → 小宇宙定时抓取自动出现新单集（无逐期"发布"动作）
```

## 三、市面产品与开源项目调研

### 3.1 商业产品

| 类别 | 代表 | 与小宇宙的关系 |
| --- | --- | --- |
| 播客托管/RSS 生成 | 爱发电（发电电子报/播客托管）、声湃等国内托管；海外 Spreaker、Podbean、Fireside、Buzzsprout | 生成标准 RSS；播客主把该 RSS 提交小宇宙即被收录（"分发到小宇宙"= RSS 一份多投） |
| 多平台一键分发工具 | 融媒宝、易媒、新媒体管家等（另含一家头部同类工具，名称按本仓品牌纪律省略） | 公开支持清单以抖音/百家/头条等图文视频平台为主，**未检索到明确支持小宇宙**（播客发布不是它们的能力面） |
| 播客制作+分发一体 | Firstory 等 | 同 RSS 机制 |

> 未确证项如实标注：3.1 第一行国内托管商逐家的"小宇宙对接"宣传页本轮未能逐一抓取成功（部分站点 502/403），结论基于教程生态交叉印证，若进入实施前需要更强证据，可逐家补取证。

### 3.2 开源项目

| 项目 | 能力 | 接口性质 |
| --- | --- | --- |
| MosesHe/xiaoyuzhoufm-mcp | MCP Server：搜索、播客/单集详情读取 | **非官方逆向 API**；手机号验证码换取 token 存本地；**无发布/写能力** |
| 播客内容抓取/下载器（CSDN 等多篇实践文） | 逆向 App 接口做本地化管理 | 同上，只读 |
| RSSHub 等聚合器 | 读取侧桥接 | 抓取/逆向 |
| 发布侧开源 | **未发现任何项目**（合理推断：无 API 可对接） | — |

## 四、实现路径分析（三条）

### 路径 A：RSS 协议分发通道（推荐）

**语义转换**：mulpub 新增的不是"小宇宙账号发布"，而是一条**协议型发布通道**——把内容产出为 Podcast RSS。小宇宙、Apple Podcasts、Spotify、泛途等所有 RSS 型播客端**一次接入、全网分发**。

需要建设的组件：

1. **音频托管**（三选一，可组合）：
   - 用户自有对象存储（阿里云 OSS / 七牛 / COS）+ mulpub 代传代管 URL；
   - 复用第三方托管（引导用户填爱发电/声湃等已生成的 RSS，mulpub 只做"投稿辅助"）；
   - mulpub 自身托管（涉及带宽/存储成本与合规，MVP 阶段不建议）。
2. **RSS 生成器**：iTunes RSS 2.0 规范（`<itunes:author>`、`<enclosure url type length>`、封面 1400×1400~3000×3000、显式/隐式集数、episode 类型）。这是纯本地模块，无平台耦合。
3. **单集发布 = 追加 `<item>` 并更新 feed**：titleMode 语义接近 caption（无独立标题字段约束但建议有集标题）、正文=show notes、媒体=音频 URL+时长+字节数。
4. **收录辅助**：首次提交在小宇宙 App 内完成（无 web 表单证据），产品上做"提交指引 + RSS 自检工具"（校验 enclosure 可达、字段合规、XML 有效性）。
5. **验证闭环**：轮询自家 RSS 确认 item 已发布（可控）；小宇宙侧同步存在小时级延迟，验收按"RSS 生效"为主判据、小宇宙展示为最终人工核对。

### 路径 B：RPA Web 自动化（价值有限，仅补充）

- 主播后台**不能发布单集**，RPA 无法实现主流程；可用于自动化后台运营动作（公告、投票、改节目信息），作为路径 A 的增值项。
- 登录为手机号验证码形态，与现有 `auth-view-manager` 验证码/手动确认流兼容，但每动作价值低、页面改版脆弱性高。**不建议进 MVP**。
- 首次投稿入口在 App 内，桌面 RPA 不可达。

### 路径 C：逆向私有 API 发布（不推荐）

- 现证据只覆盖读接口；写接口未发现且即便发现也属未授权访问，违反平台 ToS，账号与合规风险高（对齐本项目"聚合外部 API 先过判据再展示"的既有红线）。**明确排除。**

## 五、mulpub 项目落点（基于当前代码架构摸底）

> 本节行号来自 2026-10-09 对 origin/main 的只读调研，实施前需按当日代码复核。

### 5.1 登记面（新增平台的单一真源清单）

| 位置 | 要做什么 |
| --- | --- |
| `packages/shared-utils/src/platform-definitions.js`（+ `.browser.js`、`platform-display-definitions.json`） | 新增 `xiaoyuzhou` 键：显示名/图标、`content_category: audio`。RSS 通道**不依赖**登录 URL/AUTH_HOSTS/会话标记（无站内发布即无凭证采集需求，若做路径 B 运营动作再补） |
| `packages/shared-utils/src/publish-capabilities.json`（双端 CJS/ESM 消费） | 新平台完整性断言要更新（`__tests__/publish-capabilities.test.js` 58 例含 15 平台完整性——变 16 平台需同步该精确断言） |
| `config/platforms.yaml` | 新平台段：`publishMode` 需为 RSS 通道引入第三态或新枚举（现有 `has_api` 闸口语义是"引擎 API"，RSS 不是 API 也不是 DOM RPA——**架构决策点**） |
| `packages/platform-schedule-capability.json` | 定时发布能力登记（RSS 通道天然是"到点更新 feed"） |
| `packages/api-publish-engine` | 若做独立 executor：新通道类型 `rss`（不进 DOM RPA 的 `platform-selectors.js`、不进 API adapters，或按 adapter 基类新建 `rss-podcast` 型——建议前者，因为它没有"登录→上传→提交"的平台交互面） |
| `ops-center/backend/models.py` PlatformDef + `routers/platform_defs.py` | 运营面同步；注意跨端目录常量↔存量数据前向兼容 MUST（增量补齐只补不改） |
| locales zh/en 成对（Gate 7）、`01-docs/i18n-glossary.md` | 全部用户可见文案 |

### 5.2 新增能力面（本项目当前不存在的）

- **音频发布品类先例缺失**：全仓无音频发布平台（最接近的是视频号 BGM 查询与 AI 音乐生成适配器，均非发布侧）。`content_category` 需扩展音频语义，涉及发布表单（媒体选择=音频文件、时长展示）、草稿/历史、发布进度事件相位等既有链路对音频的支持度排查。
- **RSS 生成/自检模块**：新模块，建议落 `packages/shared-utils` 或新包（纯函数、可单测）。
- **托管上传通道**：OSS 直传（凭证走信封加密既有模式）或"用户自托管、mulpub 只生成 feed"两种形态先选后者起步。

### 5.3 质量节拍预判（实施阶段）

- 变更类型：📦 新增功能 + 🏗️ 新通道类型（架构级）→ 必经 Phase 0.3 PRD → Phase 1.1 架构评审（含 `publishMode` 第三态决策）→ OpenSpec change（M+/中高风险）→ TDD → QM-1 打包验证 → QM-6 双模型评审。
- 分层分支：运行时代码变更 → 隔离 worktree（`scripts/start-mp-task.ps1 -TaskName podcast-rss-channel` 类）。

## 六、建议与决策请求

1. **采纳路径 A**，把功能定义改写为「播客 RSS 频道发布（自动覆盖小宇宙收录）」；产品叙事上仍可满足"发布到小宇宙"的用户心智（一次提交收录，此后每期自动到）。
2. MVP 范围建议：音频托管=用户自托管 URL 或 OSS 直传二选一先行；RSS 生成 + 小宇宙投稿指引 + RSS 自检；不做主播后台 RPA。
3. 待人工决策的开放问题（写 PRD 前对齐）：
   - D1：托管形态（用户自有 OSS vs mulpub 代托管）——影响成本、合规与工作量；**分析结论见 §八**；
   - D2：`publishMode` 是否引入第三态 `rss`（涉及 `config/platforms.yaml` 语义与 rpa-view-manager 闸口，属架构评审事项）；**分析结论见 §九**（结论：不进三态总闸，走正交通道类型）；
   - D3：范围是否只到"生成/更新 feed"，还是含多 RSS 平台目录（Apple/Spotify 一并提交指引）。**分析结论见 §九**（结论：纳入，但以"目录+指引"形态承载，不登记为逐期发布平台）。

## 八、D1 专项分析：托管形态（2026-10-09 补充）

### 8.0 先修正一个成本前提：播客聚合端会缓存音频

小宇宙/Apple Podcasts 等聚合端在收录新单集时会**主动拉取音频回流到自家 CDN**（用户在小宇宙里播放的通常是聚合端缓存源，而非播客主原始 URL）。因此托管方的带宽暴露主要是"聚合端抓取"这一次性量级，**不是用户播放量的持续乘法**——这显著削弱了"代托管带宽会失控"的传统顾虑。原始 URL 仍须在**发布窗口内可达且稳定**（抓取失败即该集在小宇宙侧缺失，且部分长尾客户端仍直拉原始 URL）。

### 8.1 现有基础设施盘点（实测）

- 仓库**已有 OSS/COS 分片上传引擎**：`packages/api-publish-engine/src/oss-uploader.js`（STS 临时凭证 + 8MB 分片 + CompleteMultipartUpload）、`upload/providers/oss-provider.js` + `upload/orchestrator.js`（token 获取→上传编排），另有 `cos-uploader.js` 腾讯系对应物；架构决策见 `docs/adr-002-upload-strategy.md`。
- 注意其现状归属：这套引擎是**借参考产品的凭证签发端**做发布中转上传用的，**不是 mulpub 自有的托管桶**；即"直传工程能力"现成，"桶与凭证签发服务"缺位。
- 已有的配套：credential-store 本机 AES-256-GCM 加密凭证、云端信封加密（KMS）、entitlement/Pro 配额体系——若做代托管，计费与配额挂接路径是现成的。

### 8.2 三形态对比

| 维度 | A. 用户自带 URL/已有 RSS（零托管） | B. 用户自有 OSS，mulpub 代传 | C. mulpub 代托管（自有桶） |
| --- | --- | --- | --- |
| 存储/带宽成本 | 0 | 0（用户账单） | 存储+外网流量+CDN，随用户数增长；8.0 缓和但未消除 |
| 用户门槛 | 高（需已有稳定外链，实操多为"用爱发电/声湃传好再来"） | 中高（开通 OSS、Bucket 公共读、跨域配置、AK 管理） | 低（开箱即用） |
| 合规责任 | 无（不存内容） | 无（内容在用户账户；注意帮用户签名不等于代持） | **重**：mulpub 成为内容托管方，涉 ICP/增值电信、内容审核义务、盗版存储与下架处理 |
| feed 稳定性风险 | 用户自负 | 用户自负（桶删了 feed 断，产品侧可做"URL 可达性自检"预警） | **平台承担**：用户 churn 后 feed 归属、到期关停策略都要设计 |
| 工程增量 | 仅 RSS 生成/自检 | 复用 OssUploader，改为「用户自配 AK/bucket」形态（STS 不需要，直传签名本地化；凭证进 credential-store 同源加密） | 需新建：服务端凭证签发（STS）+ 配额/计费 + 审核流水线 + 运维面板——量级最大 |
| 商业化价值 | 无 | 无（用户钱花在云上） | 可作 Pro 配额卖点，但与开源托管/爱发电免费额度直接竞争，毛利薄 |

### 8.3 结论与推荐：**B 为主、A 为底线、C 设门槛后置**

1. **P0（MVP 必答）**：形态 A——mulpub 只负责"音频外链 → RSS 生成/更新/自检"，不碰存储。这保证功能当天可用、零成本、零合规负担，且自检工具（enclosure 可达性、XML 有效性、字段合规）对所有形态都复用。
2. **P1（核心推荐落地形态）**：形态 B——"用户自有 OSS/COS 直传"。这是本项目的最佳性价比点：
   - 用户画像匹配：mulpub 用户是自媒体运营者，痛点是"本地成片没有稳定外链"，而非"没有云"；一次配置后发布管线全自动。
   - 工程复用度最高：`oss-uploader.js`/`oss-provider.js` 的分片上传引擎、`adr-002` 的编排骨架、credential-store 加密、S3/COS 双形态都有既有代码在；无需新建任何服务端。
   - AK 风险隔离：用户 AK 只授权该 bucket 的对象读写，本地加密存储，泄漏责任与爆炸半径都在用户侧。
3. **P2（条件后置，不进 MVP）**：形态 C——代托管 Pro 增值服务。启动前置条件三条（缺一不做）：
   - 能收费：绑定 entitlement 配额（存储 GB + 抓取流量），定价覆盖云账单；
   - 可审核：接入内容审核与投诉下架流程（至少机审+举报通道）；
   - 可退出：设计"用户 churn 后 feed 归属/迁移导出"，避免托管断供把收录账号打死。
4. 反对一步到 C 的核心理由：C 把"发布工具"的产品定位改写成"播客托管服务商"，与既有免费生态（爱发电/声湃/海外托管商）正面竞争，却同时继承其全部运维与合规负担；而 A+B 已覆盖"发布到小宇宙"的用户目标本身（RSS 一旦收录，逐期更新走的是用户自己的源）。

## 九、D2/D3 专项分析（2026-10-09 补充）

> 取证基线：2026-10-09 对 origin/main 的只读 grep/Read。行号以当日为准，实施前须复核。

### 9.1 D2：`publishMode` 是否新增 `rss` 态 → **结论：不加，RSS 走正交通道类型**

**现状取证（三处）**

1. 值域封闭：`config/platforms.yaml` 注释钉死「W1 §5.1 三态总闸：api-only|api-then-dom|dom-only」，实测现存值仅 `dom-only` / `api-then-dom`。
2. 闸口语义：`apps/desktop/electron/services/rpa-view-manager.js` L73-74 判定为
   `mode != null ? mode !== 'dom-only' : apiRouter.shouldUseApi(platform)`
   —— 即"**非 dom-only 一律进 API 轨**"。若直接给 yaml 加裸值 `rss`，会被这个表达式**错误路由进 API 发布轨**（去调 api-publish-engine 适配器和并不存在的 rss adapter），静默契约断裂而非响亮失败。
3. 该开关面历史上出过事：CHANGELOG/记录显示 2026-10-06 修正过 douyin/tencent_video 的 `publishMode` 与 `has_api` 双闸矛盾（闸门曾只读 `shouldUseApi` 而无视 `publishMode`，是实故障）；kuaishou 的 `api-then-dom` 至今是"空转开关"待决项。**闸口值域是回归高敏区**。

另外存在**同名异义字段**：历史记录/任务侧的 `publishMode:'scheduled'`（`phase4-events.js` / `batch-manager.js` 写历史用）是"定时发布标记"，与 yaml 三态总闸完全无关。D2 的讨论范围仅指后者。

**语义论证**：三态总闸回答的问题是"**这个平台的逐期发布走 API 轨还是 DOM 轨、失败时是否降级**"。RSS 通道既没有"站内 API 可发"也没有"网页上传表单可 RPA"——它对这两条轨都**不可路由**。给二选一的路由器加第三选项是类别错误：`rss` 不是"另一种发布方式的路由策略"，而是"**另一种通道**"。

**两个候选方案对比**

| 维度 | 方案一：正交通道类型（推荐） | 方案二：publishMode 加第四态 `rss` |
| --- | --- | --- |
| 语义正确性 | `publishMode` 值域与注释保持不变；通道类型（如平台段新增 `channel: rss` 或复用 `content_category: audio` + executor 按通道分发）独立表达 | 把"路由器枚举"扩成"通道枚举"，语义混杂 |
| 既有闸口 | **零改动**——`rpa-view-manager.js:73` 的三态判定不被触碰，`publish-mode-gate.test.js` 全部既有锁（api-only 停报 `stoppedBy:'api-only'`、api-then-dom 降级、has_api 矛盾组合）原样保持 | L73 表达式必须改写（`mode==='rss'` 提前分流），三态不变量被破坏；`getMode`/config-loader 枚举校验/api-router 四件套同步改 |
| 误路由风险 | RSS 平台在入口层分流，根本进不了 rpa-view-manager；yaml 误配 `publishMode: rss` 时枚举校验 fail-closed 报错 | 现闸口对未识别新值的默认行为就是"进 API 轨"，正是本方案要防的静默断裂；改漏一个消费点即事故 |
| 历史契约 | 不动高敏开关 | 又一次改宽历史上出过事的高敏开关值域（AGENTS.md「登录承载/闸口类改动须逐入口核对」同族纪律） |

**架构评审仍需拍板的三个落点**（方案一内部选择，不是方案一 vs 二）：

1. **字段命名与位置**：`config/platforms.yaml` 平台段新增 `channel: rss`（或顶层 `channels:` 注册表）；config-loader 对未知 `channel` 值必须 fail-closed。
2. **路由判定点**：发布任务入口（executor / publish-api-server / RPA 编排的调用方）按平台通道类型分叉，RSS 平台不进入 `rpa-view-manager`；需要一条**接线守卫**断言"`channel: rss` 的平台永不出现在 DOM/API 轨的调度集合里"（防止下一个会话把它当普通平台塞进 RPA 队列）。
3. **配套登记与契约同步面**：`publish-capabilities.json` 无标题平台清单 A 清单断言、`platform-definitions.test.js`（RSS 平台**不登记**登录 URL/AUTH_HOSTS/会话标记——无凭证采集面）、发布进度事件相位枚举（"feed 更新成功/失败"是否新增终态，参照 cancelled 中性终态先例三处同步 `PHASE_ENUM`/`TERMINAL_PHASES`）、`platform-schedule-capability.json` 登记。

### 9.2 D3：范围是否含 Apple/Spotify 提交指引 → **结论：纳入，但形态是"目录 + 指引"，不是逐平台发布实现**

**为什么纳入**

1. **一份 feed 多投是播客分发的本体**。RSS 一旦生成，提交小宇宙、Apple Podcasts Connect、Spotify for Podcasters（以及喜马拉雅/荔枝/听播客等国内 RSS 型端）用的是**同一份地址**；"发布到小宇宙"的用户目标天然延伸为"一次发布、全网播客端可达"。
2. **边际成本极低**：发布实现零增量（共用同一 feed 生成器/自检器），增量只有提交指引文案与目录数据。
3. **不做则价值感知受损**：MVP 只提小宇宙，用户会误以为"只能到小宇宙"，而功能实际覆盖全网 RSS 端——这是产品叙事的损失。
4. **外部事实核验（2026-10-08 补做）**：曾有"Apple 将关闭 Podcasts Connect 自助提交、只认商业托管商"的讨论（行业媒体报道过），实测核验结论：截至本报告日期 Apple Podcasts Connect 提交入口仍在正常服务，RSS 自助提交仍是主通道。另注意 Apple 对**新节目**审核趋严、收录时效为小时到天级，指引文案需按此撰写并标注"以对方后台当日实况为准"。

**风险与正确形态**

若把每个 RSS 端逐个登记成"可登录的发布平台"，会污染登录判定契约面：`PLATFORM_LOGIN_URLS`/`AUTH_HOSTS`/`SESSION_COOKIE_MARKERS`/凭证采集四处门禁对它们**没有任何一个有真实语义**（没有"登录上传"这回事），`publish-capabilities` 15→15+N 的平台完整性断言、rpa-engine `platform-selectors`、api-publish-engine 注册表、ops-center PlatformDef 全部被虚假拖入。这是典型的"字段名相同 ≠ 语义相同"（AGENTS.md 已有同款判据：GitHub issue 标题 ≠ 内容标题）。

**建议的分期交付**

- **P0**：RSS 生成 + 自检 + **小宇宙**投稿指引（App 内提交，人工一次）。
- **P1**：Apple/Spotify 等提交指引清单——纯文案 + 链接 + 各端收录时效说明；数据结构建议为独立的"分发端目录"（类似 `publish-capabilities.json` 的注册表模式），**不进入平台登录/发布契约面**；`publishMode` 与三态闸口完全不涉及。
- **P2（可选，不进 MVP）**：收录状态观测（轮询各端公开节目页判断是否出现新单集）。涉及新增第三方读取面，届时按既有红线先过相关性/合规判据。

**质量节拍归位**：D3 的指引内容本身是文档/文案级增量（locales zh/en 成对、i18n-glossary、`01-docs/` 指引），可在通道落地后走 docs-only 快速通道持续补充，不需要独立运行时 PR。

## 七、证据来源

- [小宇宙官网](https://www.xiaoyuzhoufm.com/)（首页抓取：无开放平台/API 入口，仅主播后台）
- [小宇宙官方博客 · 主播后台专栏](https://blog.xiaoyuzhoufm.com/tag/podcaster/) / [新手主播 8 个小功能](https://blog.xiaoyuzhoufm.com/podcaster-manual/)（功能面=运营互动，无上传/发布单集）
- [知乎 · 如何将播客上传到小宇宙](https://www.zhihu.com/question/435233336/answer/1927561429)、[百度知道 · 小宇宙如何上传节目](https://zhidao.baidu.com/question/533112944628311605.html)、[ZOL 小宇宙上传节目指南](http://m.zol.com.cn/article/11239475.html)（RSS 收录机制交叉印证）
- [知乎 · 理解播客里的 RSS](https://zhuanlan.zhihu.com/p/341607687)、[豆瓣 · 做播客需要了解的技术性问题](https://m.douban.com/note/792820406)（播客=RSS 开放协议的生态位说明）
- [MosesHe/xiaoyuzhoufm-mcp](https://github.com/MosesHe/xiaoyuzhoufm-mcp)（非官方逆向 API、只读、验证码 token，无发布能力）
- [CSDN · 小宇宙 API 逆向抓取工具](https://m.blog.csdn.net/weixin_33695082/article/details/89776096)（读侧实践）
- 某通用图文/视频分发工具的学院文章《分发工具对比》（来源链接含被禁品牌域名，按本仓品牌纪律省略 URL）（通用分发工具支持面为图文视频，未见小宇宙）
- [sspai · Firstory 播客分发](http://sspai.com/post/82168)、[v1tx · 播客托管平台推荐](https://www.v1tx.com/post/best-podcast-hosting/)（托管→RSS 分发生态）
