# PRD：超大文件门禁从「只挡新增」改为「点名还账 + 测试文件纳管」（m7-repayment，2026-10-07）

> 关联缺陷：前端深度审查报告 §M-7「超大文件治理是永不下降的棘轮，98 个文件永久豁免」
> 关联实现：`.github/scripts/check-max-lines.js`、`.github/scripts/max-lines-baseline.json`
> 状态：实现中（本 PR）

---

## 一、背景与问题

### 1.1 既有门禁的五条判定

`check-max-lines.js` 的 `evaluate()` 此前只有五条判定：

| 规则 | 行为 |
|---|---|
| `NEW_OVER_LIMIT` | 新增超限文件（≥500 行）→ 阻断 |
| `LEDGER_GREW` | 挂账文件较**登记值**膨胀 > 200 行 → 阻断 |
| `STALE_LEDGER_ENTRY` | 挂账文件已不在扫描范围 → 阻断 |
| `DEBT_REPAID_LEDGER` | 已降到 500 行以下却没销账 → 阻断 |
| `LEDGER_RESURRECTED` | 墓碑路径被并发带回 → **只留痕，不阻断** |

### 1.2 缺陷一：没有一条要求存量下降

五条规则里**没有任何一条要求存量变小**。98 个挂账文件可以永久不变小。
且每条挂账还各自享有「登记值 + 200 行」的容差 —— 换句话说，每个巨型文件都还能再胖 200 行。

### 1.3 缺陷二：这 200 行容差已被静默吃掉（实测数据）

实测（2026-10-07，`--update` 的 `blockedRaise` 输出）：**98 个挂账文件中有 45 个的当前行数已高于 baseline 登记值**。

在最大的 20 个被点名文件中，12 个已漂移：

| 文件 | 登记值 | 实际行数 | 漂移 |
|---|---|---|---|
| `apps/desktop/src/views/Collection.vue` | 2721 | 2916 | **+195** |
| `packages/api-publish-engine/src/publish-api-server.js` | 1356 | 1537 | +181 |
| `apps/desktop/electron/services/story2video-stages.js` | 3866 | 4006 | +140 |
| `apps/desktop/src/views/Accounts.vue` | 1472 | 1568 | +96 |
| `packages/python-backend/.../video_compose.py` | 2552 | 2638 | +86 |
| `apps/desktop/electron/services/rpa-view-platforms.js` | 1422 | 1476 | +54 |
| `apps/desktop/src/locales/zh.js` | 3709 | 3753 | +44 |
| `apps/desktop/src/locales/en.js` | 3709 | 3741 | +32 |
| `apps/desktop/src/views/Publish.vue` | 1730 | 1757 | +27 |
| `apps/desktop/src/styles/cohere-design-system.css` | 1686 | 1698 | +12 |
| `apps/desktop/electron/home-shell-preload.bundle.js` | 1581 | 1592 | +11 |
| `apps/desktop/src/views/ResultView.vue` | 1882 | 1888 | +6 |

`Collection.vue` 只差 5 行就会撞上 +200 那条线并被拦下 —— 也就是说**它是在红线的边缘被人察觉的，不是被门禁挡住的**。

### 1.4 缺陷三：测试文件完全不在门禁视野内

`EXCLUDE` 含 `tests` / `test` / `__tests__`，而排除判定是 `rel.includes(x)` 的**子串匹配** ——
`.test.js` 里含 "test"，于是 1024 个测试文件全部被顺带排掉。

| 指标 | 数值 |
|---|---|
| 测试文件总数（排除后仍被扫到的为 0） | **1024** |
| 其中 >500 行 | **102** |
| 其中 >1500 行 | **13** |
| 最长 | `apps/desktop/src/views/CreateView.test.js` **6574 行** |
| 被它测的源码 | `CreateView.vue` **5656 行** |

测试文件比它所测的源码还长 900 行，且完全不受任何行数约束。

---

## 二、本次改法

### 2.1 点名还账 `targets`（解决 1.2 / 1.3）

给最大的 20 个挂账文件各记一个**目标行数**，**容差 0** —— 命中 `targets` 的文件天花板就是目标值，
不再走「登记值 + 200」。

- **目标值锚在「当前实际行数」而非「baseline 登记值」**。这不是取巧：若锚在登记值，
  1.3 节那 12 个已漂移文件一上线就红 —— 那不是门禁在工作，是基线本身已经失真。
  先承认已发生的漂移，再从今天起冻结。
- **`targets` 优先于墓碑**。被点名的文件不得借墓碑复活逃逸（否则违反「僵尸条目不得当免死金牌」）。
- **`--prune <路径>` 会连带摘掉 `targets` 同名条目**。留着会让已还债文件继续被 0 容差盯着，
  成为一条永远命不中的僵尸目标。

### 2.2 排除名单（关键可用性约束）

以下三类**不进入点名清单**，继续走「登记值 + 200」：

| 排除 | 理由 |
|---|---|
| `*.bundle.js` | esbuild 构建产物，每次构建行数随依赖/API 变动，与手写行数无关 |
| `src/locales/*.js` | i18n 词条表，任何一次新增文案都会让它变长 |
| `*.design-system.css` | 设计令牌表，随设计系统维护而变 |

给它们 0 容差等于「任何一次 i18n 新增都让 CI 红」，门禁直接不可用。
这三条恰是 baseline 旧注释里「生成物行数随 API 变动、容差已被吃满」的同一批。

### 2.3 测试文件通道（解决 1.4）

新增 `scanTestFiles()`，与源码扫描**并列而非替换**：

| 项 | 值 |
|---|---|
| 识别规则 | `.test.*` / `.spec.*` |
| 扫描根 | `SCAN_DIRS` **+ `apps/desktop/tests`** |
| 上限 `testLimit` | **1500** |
| 增量容差 | 200（同源码） |
| 独立挂账表 | `testFiles` / `testPruned` |
| CLI | 新增 `--prune-test <路径>` |
| 存量挂账 | 13 个 >1500 的测试文件 |

为什么 1500：测试文件天然比被测代码长（断言 + 夹具 + mock），套用同一个 500 会逼出无意义的拆分；
但完全不管就出现了 6574 行的 `CreateView.test.js`。1500 是在「不逼无意义拆分」与
「不让它无限长」之间的取点。

扫描根额外加 `apps/desktop/tests`：源码侧不需要它（那里只有 e2e/visual 夹具），
但那里有最大的几支测试文件（`story2video-*`、`webview-manager`）。
用源码的 `SCAN_DIRS` 会让「测试文件进门禁」只覆盖内联测试、漏掉整个 `tests/` 目录。

---

## 三、交互逻辑与提示文案

### 3.1 新增违规类型与文案

| 违规码 | 触发条件 | 提示文案（面向提交者） |
|---|---|---|
| `TARGET_GREW` | 点名文件超过目标行数 | `… 现 N 行已超过点名目标 M 行（超 K）。被点名还账的文件一律零增长容差：降到目标以下，或在 review 中说明理由后一并上调 targets` |
| `TEST_OVER_LIMIT` | 新测试文件 ≥1500 行 | `… N 行 >= 1500，测试文件超过上限。新增的超限测试不得进来；存量已挂账的按 TEST_LEDGER_GREW 管` |
| `TEST_LEDGER_GREW` | 挂账测试文件较登记值膨胀 >200 | `… 较登记值 M 膨胀 K 行（容差 200），测试文件同样要拆（按被测模块/场景分文件），别再堆成一个` |
| `TEST_STALE_LEDGER_ENTRY` | 测试挂账文件已删/改名 | `… 已不在测试文件扫描范围内（文件已删/改名），请 --prune-test <路径>` |
| `TEST_DEBT_REPAID` | 测试文件已降到 1500 以下 | `… 已降到 N 行 < 1500，请 --prune-test <路径> 单键清账` |

### 3.2 门禁摘要行新增两项计数

```
limit=500 growthAllowance=200 超限文件=98 挂账=98 墓碑=1 点名还账=20
testLimit=1500 测试超限=13 测试挂账=13
```

---

## 四、数据校验

| 校验 | 判据 | 状态 |
|---|---|---|
| 门禁主断言 | 当前 HEAD 零违规 | ✅ rc=0 |
| targets 零红 | 20 条目标值全部 = 当前实际行数 | ✅ |
| testFiles 零红 | 13 条挂账值全部 = 当前实际行数 | ✅ |
| **反证：点名文件增长** | `CreateView.vue` +2 行 → `TARGET_GREW`，exit 1 | ✅ |
| **反证：新超限测试** | 新建 1521 行 `.test.js` → `TEST_OVER_LIMIT`，exit 1 | ✅ |
| **反证：i18n 新增不得误红** | `locales/zh.js` +2 行 → **不报**（排除名单生效） | ✅ |
| 回归锁 | `check-max-lines.test.js` **27/27 通过**（既有 17 + 新增 10） | ✅ |

### 4.1 一条由外部跨家族评审抓出的 CRITICAL

外部评审（opencode / deepseek 家族）发现：**`--update` 与 `--update --rewrite` 只重建
`//, limit, growthAllowance, files, pruned` 五个键，跑一次就把 `testLimit` / `targets` /
`testFiles` / `testPruned` 四个键静默抹掉** —— 门禁当场退回「只挡新增、测试文件全不管」的旧
行为，且**零报错**。

自查（门禁主断言 + 反证 + 27 条测试）**未覆盖 `--update` 这条路径**，是外部评审补上的。
已修 `computeUpdate()` 与 `writeBaseline()` 显式搬运四个新键，并补两条回归锁
（含「缺省时必须给出空对象而非 undefined」）。复验：`--update` 后 `targets` 20 条、
`testFiles` 13 条、`testLimit` 1500 全部保留。

---

## 五、验收标准

| # | 标准 | 判据 |
|---|---|---|
| 1 | 点名文件零增长 | `TARGET_GREW` 在超目标 1 行即触发 |
| 2 | 未点名文件不受影响 | 仍在「登记值 + 200」内正常放行 |
| 3 | 生成物 / i18n / 设计令牌不误红 | `locales/zh.js` 增长不触发任何违规 |
| 4 | 新超限测试被拦 | ≥1500 行的新 `.test.js` 触发 `TEST_OVER_LIMIT` |
| 5 | 测试挂账可清账 | `--prune-test` 单键清账并立碑 |
| 6 | 点名目标可清账 | `--prune <路径>` 连带摘掉 `targets` 同名条目 |
| 7 | **`--update` 不得丢任何键** | 跑前后键集合一致 |
| 8 | 漏喂 `testData` 必须 fail-closed | 报 `TEST_STALE` 而非静默通过 |

---

## 六、不做的事

- **不拆分 `CreateView.test.js`（6574 行）**：本次只把它纳管并冻结，不做拆分。
  拆分是独立的结构性工作，应作为单独 change 走 openspec。
- **不设「总行数净下降 X%」的整体配额**：该方案易被稀释（删小文件即可达标而大文件不动），
  故采用点名还账。
- **不抬高 baseline 的 `files` 登记值**：登记值是「当初登记时的样子」，抬高它等于抹掉
  1.3 节的漂移证据。`targets` 与 `files` 的差值本身就是「已漂移多少」的可审计记录。
- **不改 `scripts/check-debt-budget.js`**：本条只动 max-lines 一道门禁。

---

## 七、遗留与后续

| 项 | 说明 |
|---|---|
| 98 个挂账文件中仍有 78 个未被点名 | 本次只点名最大的 20 个。其余沿用「登记值 + 200」 |
| 45 个挂账文件的登记值仍低于实际行数 | `--update` 会持续以 `blockedRaise` 提示，可作为逐步收敛的观察窗 |
| 13 个测试挂账文件可各再长 200 行 | 同源码侧的既定容差。若要更严需单独立项 |
| `targets` 与 `files` 的长期一致性 | 当前靠「targets 锚实际行数」保证；未来若 `--prune` 摘除某 targets 条目，`files` 会保留原登记值，属预期 |