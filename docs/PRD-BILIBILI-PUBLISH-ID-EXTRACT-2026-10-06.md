# B 站发布侧作品标识（aid/bvid）采集缺失 — 取证与修复规格

- 日期：2026-10-06
- 分支：`bilibili-bvid-extract`（worktree `D:/Data/projects/mp-worktrees/mp-bilibili-bvid-extract`）
- 关联：`docs/audit-requery-evidence-bilibili-2026-10-05.md`（回查端点取证，PR #2927）、`01-docs/AUDIT-REQUERY-EVIDENCE-CHECKLIST-2026-10-09.md` §九
- 类型：🐛 Bug 修复（发布成功判定 + 回查前置条件），QM-5 五步齐全

## 一、现象与第一性原因

B 站走 RPA 投稿时，`rpa-view-platforms.js` 的 `finish()` 需要拿到**平台作品标识 `postId`** 才判发布成功；拿不到即返回
`{success:false, error:'发布结果缺少平台作品 ID'}`（`rpa-view-platforms.js:785-788`）。
`postId` 一旦缺失，后续两件事同时落空：

1. 发布被报成失败（用户侧「明明投稿成功了」）；
2. 发布后审核回查（`publish-monitor` / `bilibili-audit-check.js`）**没有可匹配的键**——该回查判据按
   `String(archive.bvid) === String(postId)` 或 `String(archive.aid) === String(postId)` 命中
   （`bilibili-audit-check.js:44`，PR #2927 已合并）。

即：**上一轮把回查端点修对了，但发布侧产不出那个 id，回查在 B 站这条路上永远不会被触发。**

### 根因溯源（具体 commit）

| commit | 日期 | 意图 | 与本缺陷的关系 |
|---|---|---|---|
| `57082ddec` | 2026-08-24 | fix(desktop): unify QR login tabs and harden publish evidence | **第一性引入点**：写下路径段关键词表 `post\|article\|media\|content\|clue\|work`，全部按图文/管理页形态取词，未覆盖视频站的 `/video/<id>` |
| `d424c245c` | 2026-09-29 | fix(publish): 图文发布平台修复 | 把这些纯函数从 `rpa-view-platforms.js` 拆成 `rpa-publish-id-extract.js`，同一张表原样搬迁（缺陷随迁，未新增） |

当时的意图是修图文平台（公众号/知乎/头条）的发布判定，**没有做过任何 B 站发布链路取证**，因此表里缺 `video`
不是笔误而是「范围外」；真正的隐患是：这张表**只存在于一个维度**——query 键表 `PUBLISH_ID_KEYS`（第 14 行）里
**有** `video`（所以 `?video_id=` 能用），路径段表（第 57 行）里**没有** `video`。两处口径不对称，让人误以为
「视频形态已经覆盖」。

## 二、实测现场（2026-10-06，直接调用被测函数）

夹具：`node -e` 载入 `apps/desktop/electron/services/rpa-publish-id-extract.js` 真实导出，未 mock。

| 输入 | 期望（修复后） | 实测（修复前） |
|---|---|---|
| `https://www.bilibili.com/video/BV1xx411c79D/` | `BV1xx411c79D` | **null** |
| `https://www.bilibili.com/video/av170001/` | `av170001` | **null** |
| `https://member.bilibili.com/platform/upload/video/frame?bvid=BV1xx411c79D&aid=170001` | `BV1xx411c79D` | **null** |
| `{"code":0,"data":{"aid":170001,"bvid":"BV1xx411c79D"}}`（响应体） | 含 `BV1xx411c79D` | **`[]`** |
| `https://mp.toutiao.com/profile_v4/graphic/publishing?article_id=123456`（**正控**） | `123456` | `123456` ✅ |
| `{"data":{"video_id":"71888"}}`（**正控**） | `["71888"]` | `["71888"]` ✅ |

两条正控证明探针是活的、测的就是那个变量——四条 B 站形态的 null 不是夹具失效。

### 为什么"顺手把 `video` 加进路径段表"是错的

按第 56-60 行的循环语义，加 `video` 关键词后，B 站**投稿页自身的 URL**
`https://member.bilibili.com/platform/upload/video/frame`（`config/platforms.yaml:174` 的 `publish_url`）
会被切成 `[…, "video", "frame"]`，于是 `frame` 被当作作品 id 返回。`normalizePublishId` 的
`PUBLISH_ID_NAV_WORDS`（第 16 行）不含 `frame`，拦不住——结果是**给每次 B 站投稿造出一个假 id、
把失败判成成功**。这正是本规格坚持「按值的形态识别，不按路径关键词识别」的理由。

## 三、测试逃逸链（QM-5 第 2 步）

| 层级 | 为什么没拦住 |
|---|---|
| 单元 | `extractPublishIdFromUrl` **没有自己的测试文件**；其全部用例寄生在 `rpa-view-platforms.test.js` 内，而那份用例只喂图文平台形态（`?article_id=`、`/manage/…`），从未出现 `BV`/`av`/`bvid`/`aid` 样本 |
| 集成 | `rpa-view-platforms.js` 的 `finish()` 集成用例用注入的假 `result.url`（多为 `https://example.com/post/1`），命中通用表 ⇒ 掩盖了 B 站形态落空 |
| E2E/真机 | B 站 RPA 投稿从未真机跑通过（无发布历史数据：本机 9 份库实测 0 行），缺陷位于「从未被执行的那条路」上 |
| 视觉/审查 | 与本缺陷无关（不涉界面） |
| 分类 | **无测试**（缺该形态样本）+ **测试不执行**（B 站链路无真机覆盖） |

### 系统性漏洞（第 3 步，具体到文件）

`apps/desktop/electron/services/rpa-publish-id-extract.js` 的取值判据只有**一种机制**：
"路径段的前一段命中关键词表" 或 "键名命中前缀表"。两种都是**按命名猜**，没有任何一条按**值的形态**识别作品标识。
凡是把标识放在非常规键名（`bvid`）或非常规段名（`/video/BV…`）的平台，该机制**结构性失明**。
配套缺失：该模块没有独立测试文件（AGENTS.md「测试文件必须显式接进 CI，否则等于没写」的同族——
连测试都没有），新增判据无从登记。

## 四、修复方案（严格加法式）

不改既有两条判据的行为，新增一条**按值形态 + 按主机**的正向识别，以及两个 B 站键名：

1. `BILIBILI_WORK_ID_SHAPE`：`^BV[0-9A-Za-z]{5,20}$` 或 `^av\d{4,}$`（B 站作品标识的唯一形态）。
2. 路径段：仅当 **host 命中 `bilibili.com` / `bilibili.tv`** 且该段本身命中形态 → 直接采纳；
   其余平台/其余段一律不变（故 `/upload/video/frame` 不可能产出 `frame`）。
3. 键名：`bvid` 取到值必须命中 `BV…` 形态；`aid` 取到值必须是 `\d{4,}$`。
   形态约束把「别的平台恰好也有个叫 `aid` 的字段」的误判面压到形态级别。
4. 通用 `PUBLISH_ID_KEYS` / `PUBLISH_ID_NAV_WORDS` **不动**，避免影响图文平台既有结论。
5. **两条链同形（QM-6 双模型同一条 Critical 的修法）**：URL 链与响应体链都必须
   「host 命中 bilibili」+「值合形态」才采纳。响应体链原本只有形态门没有主机门——
   `aid` 这类键在字节系接口里普遍存在且语义不是作品 id（本仓实测 `_aid` 是应用实例标识），
   取错就是把发布失败判成成功。因此 `extractPublishIdsFromResponseBody(body, { endpoint })`
   新增端点上下文，由 `parsePublishResponseEvidence` 传入；**没有端点上下文时一律不采纳**。
6. **优先级确定性**：B 站专属判据整体排在通用判据之后（query 命名表 → 路径关键词表 → B 站 query → B 站路径段）；
   query 里同时存在 `aid` 与 `bvid` 时**按形态择优取 `bvid`，与参数顺序无关**（此前依赖参数先后是偶然正确）。

### 六维度对照

- **数据校验**：值形态判据（`BV…`/`av\d+`/`\d{4,}`）先于采纳；不合法一律回落既有链路。
- **流程**：`extractPublishIdFromUrl` 的优先级保持在通用判据**之后**（先按既有语义，再按 B 站形态），
  使既有平台结论逐字不变。
- **功能逻辑**：命中即返回规范化后的原值（不剥前缀、不小写化——回查侧按 `String(...)` 精确比）。
- **显示项/提示文字**：不改界面、不改文案、零 locale 变更。
- **异常路径**：URL 解析失败仍走既有 `catch` 返回 null；不新增抛出。
- **边界**：空串、缺协议、`//host` 形态、超长段（>20 字符）、`BV` 后接非法字符，全部必须返回 null。

## 五、验收标准

| # | 判据 | 锁 |
|---|---|---|
| A1 | `/video/BV1xx411c79D/` → `BV1xx411c79D` | 新 `rpa-publish-id-extract.test.js` |
| A2 | `/video/av170001/` → `av170001` | 同上 |
| A3 | `?bvid=BV1xx411c79D` / `?aid=170001` → 对应值 | 同上 |
| A4 | 响应体 `{"data":{"aid":170001,"bvid":"BV…"}}` → 含该 bvid | 同上 |
| A5 | **负例**：`/platform/upload/video/frame` → null（不得产出 `frame`） | 同上 |
| A6 | **负例**：非 B 站主机的 `/video/anything` → 不因新规则产出 id | 同上 |
| A7 | **负例**：`?aid=abc`（非数字）/`?bvid=notbv`（非法形态）→ null | 同上 |
| A8 | 既有图文/管理页结论逐字不变（`?article_id=`、`/manage/` 等原用例全绿） | 消费者并集 |
| A9 | 接线：新测试文件必须显式接进 CI（Gate 2b/2c 或 vitest workspace 收集），并以「CI 日志出现该文件名」为证据 | `check-unwired-tests.js` |
| A10 | 反证：摘掉形态判据 ⇒ A1-A4 变红；把 A5 的规则放宽成「加 video 关键词」⇒ A5 变红 | 变异实跑 |
| A11 | **装配锁**：`_verifyPublishSuccess` 在作品页 URL / 停在投稿页时由响应体证据 / 两者皆无三种输入下，分别得到 `postId=BV…`、`postId=BV…`、`success:false`（证明新判据真的产出 postId，且不会凭 `/video/frame` 造假 id） | `rpa-view-platforms.test.js` |
| A12 | **主机门**：`extractPublishIdsFromResponseBody(body)` 无 endpoint、或 endpoint 属抖音/快手时，`aid`/`bvid` 一律不采纳；通用 `article_id` 不受影响 | 同上 A4b |

## 六、未观测项（不许外推，如实登记）

1. **B 站投稿提交成功后浏览器实际落在哪个 URL** 未经真机观测——本机发布历史实测 0 行，无从取证。
   因此本修复是「把三种合理承载（公开作品页 URL / query 参数 / 提交响应体）一次补齐」，
   而不是声称某一条已被现场命中。真机端到端观察 = 仍需一次真实投稿（需用户授权，见 §八）。
2. `aid`/`bvid` 作为**响应体键名**的依据来自 2026-10-05 只读取证的稿件列表响应
   （`data.arc_audits[]` 同含 `aid` 与 `bvid`）；投稿接口响应体形状未单独取证。
3. `platform-metrics/index.js:97` 既有契约「B 站 postId 即 bvid、作品页 URL 形如
   `https://www.bilibili.com/video/<postId>`」是本规格路径判据的**仓内既有证据来源**（非本次新假设）。
4. **抖音 / 快手 / 微博的发布提交端点响应体里是否存在 `aid`（及语义是否为作品 id）未取证**。
   QM-6 前端轴指出这三家（尤其快手/百家号这两个 strict 平台，其 postId 唯一主来源就是响应体证据链）
   是「一旦含 `aid` 即可能误判成功」的暴露面。本次的主机门把该面**闭合到只对 bilibili 主机生效**，
   因此不再依赖这三家的取证；取证本身作为加固项登记，不静默补。

## 六·五、QM-6 双模型评审处置

评审绑 commit `6a534bd82`。**通道偏差声明**：primary 后端 codex 经 codeagent-wrapper 实跑
（其 `exec` 工具仍报 `missing field cmd`，但结论以 stdout 落档 `D:/Data/projects/.tools/tmp/p33-qm6-backend.log`），
primary 前端 claude **静默空转**（rc=2、`completed without agent_message output`、无产物）
⇒ 按既有替代通道降级为 opencode 免费模型两路：后端 nemotron-3-ultra-free、前端 ling-3.1-flash-free，
产物落 `.ccg/qm6-bvid-{backend,frontend}-findings.json`。三通道独立收敛到**同一条 Critical**：
响应体链的 `aid`/`bvid` 规则没有主机上下文。

| 发现 | 处置 |
|---|---|
| **Critical**：`collectPublishIds` 的 aid/bvid 键无主机门，非 B 站 2xx 发布响应里的 `aid=数字` 会被采成 postId，把失败判成成功（快手/百家号这两个 strict 平台受影响面最重，其 postId 唯一主来源就是该证据链） | **已修**：`extractPublishIdsFromResponseBody(body, { endpoint })` 新增端点上下文，`parsePublishResponseEvidence` 传入 `response.url\|\|endpoint`；无上下文或非 B 站主机 ⇒ 一律不采纳。新增 A4b 负例（douyin/kuaishou 端点 + 无 endpoint 三种输入全部 `[]`）；变异 M3（把门改成恒 true）实测让 A4b 变红 |
| **Warning**：query 链里 B 站判据排在通用命名表之前，与 PRD §四.2「保持在通用判据之后」相反；且「bvid 优先于 aid」只是依赖参数顺序偶然成立（`?aid=…&bvid=…` 实测返回 aid） | **已修**：判据顺序改为 通用 query → 通用路径 → B 站 query → B 站路径段；新增 `pickBilibiliWorkId` 按形态择优（BV/av 优先于裸数字 aid），与参数顺序无关。补 A3 反序用例与 A3b（`?aid=&video_id=` 必须取通用键）；变异 M4 实测让 A3 变红 |
| **Warning**：两条链不对称（URL 有主机门、响应体没有）「不可分辨是蓄意还是遗漏」 | **已消解**：修复后两条链同形（都要求 host 命中 + 值合形态），源码注释显式写明「不存在一侧有门一侧没门」 |
| **Warning**：纯函数级用例证明不了新判据真的变成 `finish()` 的 postId（缺消费者装配锁） | **已修**：`rpa-view-platforms.test.js` 新增 3 条装配用例（作品页 URL 承载 / 投稿页停在 frame 时由证据承载 / 两者皆无必须判失败）；变异 M2、M5c 实测均让对应装配用例变红 |
| **Warning**：A10 反证没有仓库内留痕（`.quality-gates.md` 未登记） | **已修**：本次执行记录已登记 6 条变异实跑结果 |
| **Info/Warning（可扩展性）**：建议改为平台规则表驱动，避免下一个平台「再抄一份」 | **评估后不取（本 PR 范围）**：目前仅 1 个平台需要该形态，先建注册表属为假设需求设计。已在模块头部注释登记该性质变化与收敛条件（见 §七 后续项） |
| **Info**：`BILIBILI_HOST` 锚定正确（`evil-bilibili.com` / `bilibili.com.evil.net` 不误命中）；与 `normalizePublishId` 无双重放行；未把未观测写成已验证；无凭证/日志新增面 | 无需改动，作为既有判据的旁证 |


## 七、预防措施（第 5 步，落地到文件）
- 新建 `apps/desktop/electron/services/rpa-publish-id-extract.test.js`：把「作品标识按值形态识别」
  与「`video` 关键词不得裸加」两条钉成可执行锁（A5/A6 负例是防再犯的核心）。
- `.quality-gates.md` 增加本次执行记录（含反证清单与远程同步 PENDING）。
- 记忆/欠账：真机端到端观察（需授权）与「其余视频型平台（抖音/快手/视频号）同样只有图文形态判据」
  两条登记，不静默修。

### 后续项（本 PR 明确不做，逐条给理由）

1. **平台规则表驱动**：当第 2 个平台需要「专属键名 + 值形态」判据时，把
   `PLATFORM_WORK_ID_RULES = [{ host, keys, shape }]` 抽成表，而不是在
   `matchBilibiliWorkIdKey` / query 分支 / 路径分支三处各加一份（QM-6 前端轴 Warning）。
   现在只有 1 个平台，先抽表属为假设需求设计。
2. **抖音/快手/微博提交端点的响应体键集取证**：主机门已闭合误判面，取证属加固（见 §六.4）。
3. **真机端到端观察**：投稿后实际落点 + 回查徽标联动（见 §八，需用户授权）。

## 八、授权边界

本次改动**不需要**任何发布动作：判据、形态、键名全部来自已合并的只读取证与仓内既有契约。
上一轮登记的「最小一次发布」授权**仍未消耗**；端到端确认（发布后徽标 + 回查真实命中）
需要一次真实投稿，B 站曝光模型与「仅自己可见」不同，**消耗前必须再次经用户确认**。
