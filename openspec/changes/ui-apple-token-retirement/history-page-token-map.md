# history-page.css 令牌三栏映射清单（批次 0 初稿）

> 用途：`ui-apple-token-retirement` Task 5 动手前的「旧 → 新 → 值差异」核对表。
> **禁止写进 CSS 注释**（Task 0 约束）；本文件为唯一清单来源。
> 取证：`node .github/scripts/check-frontend-consistency.js --json`（门禁同口径：逐消费点计数、排除注释行/测试文件），
> main@4ec7ef42 实测 **history-page.css 190 处 / 43 个不同 `--apple-*` 变量**（全库 339 处 / 10 文件）。
> 执行批次 5 时须按当时 main 复核本表（数字可能漂移）。

## 1. 颜色（观感变化最大的一类）

| 旧 `--apple-*` | 次数 | 新权威令牌 | 值差异 / 备注 |
|---|---:|---|---|
| `--apple-accent` | 15 | `--color-primary` | **#007aff → #5048E5**（Apple 蓝 → 品牌紫，全站观感变） |
| `--apple-ink-primary` | 5 | `--color-text-primary` | #1d1d1f → #1e1b4b |
| `--apple-ink-secondary` | 5 | `--color-text-secondary` | #6e6e73 → #707080 |
| `--apple-ink-tertiary` | 8 | `--color-text-muted` | #aeaeb2 → #9898a8 |
| `--apple-surface-primary` | 2 | `--color-bg-card` | 同源转发（别名层本就指它）→ 值不变 |
| `--apple-surface-secondary` | 1 | **待定** | tokens 无直接等价（候选 `--color-bg-inset`： #f5f5f7 → #faf6f8）；批次 5 需拍板语义归属 |
| `--apple-surface-tertiary` | 6 | **待定** | 同上（#e8e8ed）；候选同上或新增权威槽 |
| `--apple-border-subtle` | 4 | `--color-border` 或 `--color-border-strong` | #e5e5ea → #efefef / #e8e8e8；二选一需拍板 |
| `--apple-success` | 5 | `--color-success` | #34c759 → #34d399 |
| `--apple-success-bg` | 3 | `--color-success-soft` | rgba(52,199,89,.10) → **#d1fae5（不透明）**，叠底观感变 |
| `--apple-warning` | 5 | `--color-warning` | #ff9500 → #fbbf24 |
| `--apple-warning-bg` | 3 | `--color-warning-soft` | rgba(255,149,0,.10) → #fef3c7 |
| `--apple-error` | 6 | `--color-danger` | #ff3b30 → #ef5757 |
| `--apple-error-bg` | 4 | `--color-danger-soft` | rgba(255,59,48,.10) → #fef0f0 |
| `--apple-info-bg` | 5 | `--color-info-soft` | rgba(0,122,255,.10) → #f0f7ff |

> **浮层语义差**：`-bg` 系列原为**半透明叠底**，权威 `-soft` 系列是**不透明色**。落在非白底（如 tertiary 面）上的观感会变——批次 5 基线核对时重点看这几处。

## 2. 尺寸与圆角（Decision Point 1：采纳 `tokens.css` 尺）

| 旧 `--apple-*` | 次数 | 新权威令牌 | 值差异 |
|---|---:|---|---|
| `--apple-size-xs` | 8 | `--font-size-xs` | **11 → 12px**（变） |
| `--apple-size-sm` | 5 | `--font-size-sm` | 13 → 13（同） |
| `--apple-size-base` | 3 | `--font-size-base` | 15 → 15（同） |
| `--apple-size-lg` | 1 | `--font-size-lg` | 20 → 20（同） |
| `--apple-size-xl` | 1 | `--font-size-xl` | 24 → 24（同） |
| `--apple-radius-sm` | 6 | `--radius-sm` | **6 → 8px**（+2） |
| `--apple-radius-md` | 2 | `--radius-md` | **10 → 12px**（+2） |
| `--apple-radius-pill` | 2 | `--radius-full` | 9999 → 9999（同） |

> ⚠️ **命名陷阱**：`--apple-radius-pill`（9999px）**不等于** `--radius-pill`（32px）。必须映射到 `--radius-full`，否则胶囊圆角会退化成 32px 圆角。

## 3. 间距（值同，但有一处缺槽）

| 旧 `--apple-*` | 次数 | 新权威令牌 | 值差异 |
|---|---:|---|---|
| `--apple-space-1` | 8 | `--spacing-1` | 4px（同） |
| `--apple-space-2` | 10 | `--spacing-2` | 8px（同） |
| `--apple-space-3` | 12 | `--spacing-3` | 12px（同） |
| `--apple-space-4` | 10 | `--spacing-4` | 16px（同） |
| `--apple-space-5` | 4 | `--spacing-5` | 20px（同） |
| `--apple-space-6` | 1 | `--spacing-6` | 24px（同） |
| `--apple-space-8` | 2 | `--spacing-8` | 32px（同） |
| `--apple-space-16` | 1 | **缺槽** | 64px；tokens.css 的 spacing 族止于 `--spacing-10`(40px) → 批次 2 需补 `--spacing-16`（或改用既有最近档，需拍板） |

## 4. 待补槽（Decision Point 2：先补权威槽再迁移）

tokens.css **当前不存在**下列族，批次 2 必须先补，批次 5 才能引用：

| 旧 `--apple-*` | 次数 | 需补的权威槽 | 沿用值（别名层现值） |
|---|---:|---|---|
| `--apple-weight-medium` | 9 | `--font-weight-medium` | 500 |
| `--apple-weight-semibold` | 3 | `--font-weight-semibold` | 600 |
| `--apple-weight-regular` | 1 | `--font-weight-regular` | 400 |
| `--apple-weight-bold` | 1 | `--font-weight-bold` | 700 |
| `--apple-font-text` | 4 | `--font-family-text` | `'SF Pro Text', 'Inter', 'PingFang SC', system-ui, sans-serif` |
| `--apple-font-display` | 1 | `--font-family-display` | `'SF Pro Display', 'Inter', 'PingFang SC', system-ui, sans-serif` |
| `--apple-leading-relaxed` | 1 | `--leading-relaxed` | 1.625 |
| `--apple-duration-normal` | 4 | `--duration-normal` | 200ms |
| `--apple-duration-fast` | 3 | `--duration-fast` | 120ms |
| `--apple-ease-default` | 7 | `--ease-default` | `cubic-bezier(0.25, 0.1, 0.25, 1)` |
| `--apple-ease-in-out` | 1 | `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |

> 字体族取值需与「品牌字体」决策一致（别名层用的是 SF Pro 栈）；批次 2 补槽时若改用品牌字体栈，属视觉变化，需在该批基线一并核对。

## 5. 阴影（值变）

| 旧 `--apple-*` | 次数 | 新权威令牌 | 值差异 |
|---|---:|---|---|
| `--apple-shadow-md` | 2 | `--shadow-md` | `0 2px 8px rgba(0,0,0,.08)` → `0 4px 12px rgba(30,27,75,.10)`（色相转品牌、扩散变大） |

## 6. 合计核对

| 类别 | 处数 |
|---|---:|
| 颜色 | 82 |
| 尺寸/圆角 | 29 |
| 间距 | 48 |
| 待补槽（字重/字体/行高/动效） | 31 |
| 阴影 | 2 |
| **合计** | **190** ✅ |

（与门禁实测 `history-page.css` 命中数一致；批次 5 完成后该文件命中须为 0。）

## 7. 批次 5 开工前仍需拍板的三项（本清单暴露）

1. `--apple-surface-secondary` / `--apple-surface-tertiary`（共 7 处）的权威语义归属：映射到 `--color-bg-inset` 还是新增权威槽？
2. `--apple-border-subtle`（4 处）：`--color-border` 还是 `--color-border-strong`？
3. `--apple-space-16`（1 处，64px）：补 `--spacing-16` 还是改用最近档（40/32）？补槽更安全。
