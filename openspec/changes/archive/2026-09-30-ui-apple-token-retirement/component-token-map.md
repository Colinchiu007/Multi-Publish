# 组件层令牌三栏映射清单（批次 3 交付物）

> 用途：`ui-apple-token-retirement` Task 3 的「旧 → 新 → 值差异」清单（AC 要求**每个组件一份**）。
> **禁止写进 CSS 注释**；本文件为唯一清单来源。
> 迁移方式：显式映射表 + 失败即停脚本（未列入映射的 `--apple-*` 即报错，绝不静默残留），
> 替换后**同一文件内 `--apple-` 残留数必须为 0**（脚本内置断言）。
> 取证口径：门禁同口径计数（逐消费点、排除注释行与测试文件）。

## 0. 校验结果（本批次实测）

| 项 | 结果 |
|---|---|
| 替换总量 | **147 处 / 8 文件**（`src/components` 88 + `features/accounts/components` 59） |
| 门禁计数 | **339 → 192**（实测，与「移除 147」精确一致） |
| 门禁基线 | 已按「只降不升」下调为 **192**（`frontend-consistency-baseline.json`） |
| 8 文件 `--apple-` 残留 | **0** |
| 受影响组件测试 | **96 tests / 0 fail**（UiButton / UiInput / UiModal / ConfigProfileManager / AccountCloudSyncDialog） |
| 陈旧 fallback | 剔除 **4 处**（见 §3） |

剩余 192 处属批次 5（`history-page.css` 190）与批次 4（`create-view.css` 2），批次 6 才钉 0。

## 1. 全局映射表（旧 → 新 → 值差异）

### 颜色

| 旧 | 新 | 值差异 |
|---|---|---|
| `--apple-accent` | `--color-primary` | **#007aff → #5048E5**（Apple 蓝 → 品牌紫，本批次最大观感变化） |
| `--apple-accent-hover` | `--color-primary-hover` | #0056cc → #603af9 |
| `--apple-ink-primary` | `--color-text-primary` | #1d1d1f → #1e1b4b |
| `--apple-ink-secondary` | `--color-text-secondary` | #6e6e73 → #707080 |
| `--apple-ink-tertiary` | `--color-text-muted` | #aeaeb2 → #9898a8 |
| `--apple-surface-primary` | `--color-bg-card` | 同源转发（别名层本就指它）→ 不变 |
| `--apple-surface-secondary` | `--color-bg-inset` | #f5f5f7 → #faf6f8 |
| `--apple-surface-tertiary` | `--color-bg-inset` | **#e8e8ed → #faf6f8**（见 §2 披露） |
| `--apple-border` | `--color-border-strong` | #d2d2d7 → #e8e8e8 |
| `--apple-border-subtle` | `--color-border` | #e5e5ea → #efefef |
| `--apple-success` | `--color-success` | #34c759 → #34d399 |
| `--apple-warning` | `--color-warning` | #ff9500 → #fbbf24 |
| `--apple-error` | `--color-danger` | #ff3b30 → #ef5757 |
| `--apple-error-bg` | `--color-danger-soft` | rgba(255,59,48,.10) → #fef0f0（半透明 → 不透明） |
| `--apple-info-bg` | `--color-info-soft` | rgba(0,122,255,.10) → #f0f7ff |

### 尺寸 / 圆角 / 间距

| 旧 | 新 | 值差异 |
|---|---|---|
| `--apple-size-xs` | `--font-size-xs` | **11 → 12px** |
| `--apple-size-sm` / `base` / `lg` | `--font-size-sm` / `base` / `lg` | 13 / 15 / 20 → 同值 |
| `--apple-radius-sm` | `--radius-sm` | **6 → 8px** |
| `--apple-radius-lg` | `--radius-lg` | **14 → 16px** |
| `--apple-space-1..6` | `--spacing-1..6` | 4/8/12/16/20/24 → 同值 |

### 字重 / 字体族 / 动效 / 阴影（批次 2 已补齐权威槽，取值刻意一致 ⇒ **渲染不变**）

| 旧 | 新 |
|---|---|
| `--apple-weight-semibold` | `--font-weight-semibold` |
| `--apple-font-text` / `--apple-font-display` | `--font-family-text` / `--font-family-display` |
| `--apple-ease-default` | `--ease-default` |
| `--apple-duration-fast` / `normal` | `--duration-fast` / `--duration-normal` |
| `--apple-shadow-sm` / `lg` | `--shadow-sm` / `--shadow-lg`（阴影值本就不保值：色相转品牌 `rgba(30,27,75,α)`） |

## 2. 本期披露的观感变化（3 处，需基线逐张核对）

1. **主色变紫**（`--apple-accent` 5 处 + `--color-primary` 派生）：全站按钮/主操作观感变化，预期内（D1）。
2. **圆角 +2px、xs 字号 +1px**：D1 已拍板接受（全站圆角统一）。
3. **hover 表面变淡**：`--apple-surface-tertiary`（#e8e8ed）→ `--color-bg-inset`（#faf6f8），
   影响 `UiButton` ghost hover 与 `UiModal` 背景等 4 处。**映射依据是本仓既有先例**：
   `ep-theme.css` 注释明确「`--color-bg-hover` 全仓无定义，与 light/lighter 同档收编到 `bg-inset`」；
   为不新增同语义重复槽（spec 禁止），沿用该口径。**风险**：ghost hover 与常态底对比度下降，
   需在基线逐张核对时确认 hover 态仍可辨识（若不可辨识，应改为在权威层新增 hover 槽而非回退别名层）。

## 3. 剔除的陈旧 fallback（第三套真相，4 处）

`AccountCloudSyncSummary.vue` 与 `AccountCloudSyncItems.vue` 各有：

- `var(--apple-success, #1f7a4d)` → `var(--color-success)`
- `var(--apple-warning, #a2650b)` → `var(--color-warning)`

`#1f7a4d` / `#a2650b` 既不等于 Apple 值也不等于权威值，是**第三套真相**；权威槽必然有定义，
fallback 属死代码，故一并剔除（而非原样搬运）。

## 4. 每组件清单

### `components/UiButton.vue`（28 处）
`--apple-accent`×3 · `--apple-radius-sm`×3 · `--apple-space-1`×2 · `--apple-space-3`×2 · `--apple-size-sm`×2 · `--apple-shadow-sm`×2 · `--apple-font-text` · `--apple-weight-semibold` · `--apple-duration-normal` · `--apple-ease-default` · `--apple-space-2` · `--apple-space-5` · `--apple-space-6` · `--apple-size-base` · `--apple-accent-hover` · `--apple-info-bg` · `--apple-ink-secondary` · `--apple-surface-tertiary` · `--apple-ink-primary` · `--apple-error`

### `components/UiInput.vue`（16 处）
`--apple-duration-fast`×2 · `--apple-ease-default`×2 · `--apple-space-2` · `--apple-space-3` · `--apple-border` · `--apple-radius-sm` · `--apple-font-text` · `--apple-size-sm` · `--apple-ink-primary` · `--apple-surface-primary` · `--apple-ink-tertiary` · `--apple-accent` · `--apple-info-bg` · `--apple-surface-secondary`

### `components/UiModal.vue`（29 处）
`--apple-space-6`×7 · `--apple-ease-default`×3 · `--apple-space-5`×2 · `--apple-duration-normal`×2 · `--apple-surface-primary` · `--apple-radius-lg` · `--apple-shadow-lg` · `--apple-size-lg` · `--apple-weight-semibold` · `--apple-ink-primary` · `--apple-font-display` · `--apple-surface-tertiary` · `--apple-ink-secondary` · `--apple-size-base` · `--apple-duration-fast` · `--apple-error-bg` · `--apple-error` · `--apple-space-4` · `--apple-border-subtle` · `--apple-space-2`

### `components/ConfigProfileManager.vue`（15 处）
`--apple-radius-sm`×3 · `--apple-ink-secondary`×2 · `--apple-size-sm`×2 · `--apple-border`×2 · `--apple-size-xs`×2 · `--apple-accent` · `--apple-error` · `--apple-border-subtle` · `--apple-weight-semibold` · `--apple-ink-tertiary` · `--apple-surface-primary`

### `features/accounts/components/AccountCloudSyncDialog.vue`（10 处）
`--apple-ink-secondary`×2 · `--apple-size-sm`×2 · `--apple-space-3` · `--apple-error` · `--apple-space-2` · `--apple-ink-primary` · `--apple-weight-semibold` · `--apple-size-xs`

### `features/accounts/components/AccountCloudSyncSummary.vue`（16 处）
`--apple-space-2`×3 · `--apple-size-sm`×2 · `--apple-error`×2 · `--apple-size-xs`×2 · `--apple-ink-secondary`×2 · `--apple-border-subtle` · `--apple-weight-semibold` · `--apple-ink-primary` · `--apple-success` · `--apple-warning`

### `features/accounts/components/AccountCloudSyncItems.vue`（12 处）
`--apple-ink-secondary`×3 · `--apple-size-xs`×2 · `--apple-space-1` · `--apple-space-2` · `--apple-size-sm` · `--apple-ink-primary` · `--apple-success` · `--apple-warning` · `--apple-error`

### `features/accounts/components/AccountCloudSyncDigestBody.vue`（21 处）
`--apple-ink-secondary`×3 · `--apple-size-sm`×3 · `--apple-space-2`×3 · `--apple-space-3`×2 · `--apple-ink-primary`×2 · `--apple-surface-tertiary`×2 · `--apple-size-xs`×2 · `--apple-space-5` · `--apple-weight-semibold` · `--apple-space-1` · `--apple-radius-sm`

## 5. 待取证

视觉基线**定向重生成**（`PIXEL_ONLY`，浅色 + 暗色各一遍并逐张核对）：本批次改了颜色/圆角/字号，
基线必然变化；按 QM-4 第 7 条须取 **CI 同源截图**入库，不得用本机图。
