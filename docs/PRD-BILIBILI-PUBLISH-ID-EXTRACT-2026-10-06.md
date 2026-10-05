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

## 六、未观测项（不许外推，如实登记）

1. **B 站投稿提交成功后浏览器实际落在哪个 URL** 未经真机观测——本机发布历史实测 0 行，无从取证。
   因此本修复是「把三种合理承载（公开作品页 URL / query 参数 / 提交响应体）一次补齐」，
   而不是声称某一条已被现场命中。真机端到端观察 = 仍需一次真实投稿（需用户授权，见 §八）。
2. `aid`/`bvid` 作为**响应体键名**的依据来自 2026-10-05 只读取证的稿件列表响应
   （`data.arc_audits[]` 同含 `aid` 与 `bvid`）；投稿接口响应体形状未单独取证。
3. `platform-metrics/index.js:97` 既有契约「B 站 postId 即 bvid、作品页 URL 形如
   `https://www.bilibili.com/video/<postId>`」是本规格路径判据的**仓内既有证据来源**（非本次新假设）。

## 七、预防措施（第 5 步，落地到文件）

- 新建 `apps/desktop/electron/services/rpa-publish-id-extract.test.js`：把「作品标识按值形态识别」
  与「`video` 关键词不得裸加」两条钉成可执行锁（A5/A6 负例是防再犯的核心）。
- `.quality-gates.md` 增加本次执行记录（含反证清单与远程同步 PENDING）。
- 记忆/欠账：真机端到端观察（需授权）与「其余视频型平台（抖音/快手/视频号）同样只有图文形态判据」
  两条登记，不静默修。

## 八、授权边界

本次改动**不需要**任何发布动作：判据、形态、键名全部来自已合并的只读取证与仓内既有契约。
上一轮登记的「最小一次发布」授权**仍未消耗**；端到端确认（发布后徽标 + 回查真实命中）
需要一次真实投稿，B 站曝光模型与「仅自己可见」不同，**消耗前必须再次经用户确认**。
