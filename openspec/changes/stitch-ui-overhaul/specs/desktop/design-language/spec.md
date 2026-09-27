# desktop/design-language (delta: stitch-ui-overhaul)

## ADDED Requirements

### Requirement: 设计令牌契约

Multi-Publish 桌面端 SHALL 以 `--apple-*` CSS 自定义属性定义统一设计令牌（颜色、字体、间距、圆角、动效），作为 stitch-ui-overhaul 及后续所有页面 UI 落地的唯一取值来源；组件 SHALL 消费令牌而非硬编码原始值。令牌取值遵循 precision minimalism（紧凑排版、清晰层级、克制用色、有目的的间距），面向信息密集的后台页面兼顾可扫描性。

#### Color Tokens

| Token | Purpose | Value |
|-------|---------|-------|
| --apple-surface-primary | Primary surface (cards, panels) | #FFFFFF |
| --apple-surface-secondary | Secondary surface (sidebar, nav) | #F5F5F7 |
| --apple-surface-tertiary | Tertiary surface (code, muted) | #E8E8ED |
| --apple-ink-primary | Primary text | #1D1D1F |
| --apple-ink-secondary | Secondary/muted text | #6E6E73 |
| --apple-ink-tertiary | Placeholder, disabled text | #AEAEB2 |
| --apple-accent | Primary action (buttons, links) | #007AFF |
| --apple-accent-hover | Accent hover state | #0056CC |
| --apple-success | Success state | #34C759 |
| --apple-warning | Warning state | #FF9500 |
| --apple-error | Error/danger state | #FF3B30 |
| --apple-border | Default border | #D2D2D7 |
| --apple-border-subtle | Subtle/hairline border | #E5E5EA |
| --apple-shadow-sm | Small elevation | 0 1px 2px rgba(0,0,0,0.04) |
| --apple-shadow-md | Medium elevation | 0 2px 8px rgba(0,0,0,0.08) |
| --apple-shadow-lg | Large elevation | 0 8px 24px rgba(0,0,0,0.12) |

#### Typography Tokens

| Token | Value |
|-------|-------|
| --apple-font-display | SF Pro Display, Inter, PingFang SC, system-ui, sans-serif |
| --apple-font-text | SF Pro Text, Inter, PingFang SC, system-ui, sans-serif |
| --apple-font-mono | SF Mono, JetBrains Mono, Consolas, monospace |
| --apple-size-xs | 11px |
| --apple-size-sm | 13px |
| --apple-size-base | 15px |
| --apple-size-md | 17px |
| --apple-size-lg | 20px |
| --apple-size-xl | 24px |
| --apple-size-xxl | 28px |
| --apple-weight-regular | 400 |
| --apple-weight-medium | 500 |
| --apple-weight-semibold | 600 |
| --apple-weight-bold | 700 |
| --apple-leading-tight | 1.2 |
| --apple-leading-normal | 1.5 |
| --apple-leading-relaxed | 1.625 |

#### Spacing and Density

| Token | Value | Use |
|-------|-------|-----|
| --apple-space-1 | 4px | Tight insets, icon gaps |
| --apple-space-2 | 8px | Compact inline gaps |
| --apple-space-3 | 12px | Default component padding |
| --apple-space-4 | 16px | Standard spacing |
| --apple-space-5 | 20px | Section inner padding |
| --apple-space-6 | 24px | Card/panel padding |
| --apple-space-8 | 32px | Section gaps |
| --apple-space-10 | 40px | Large section gaps |
| --apple-space-12 | 48px | Page-level spacing |
| --apple-space-16 | 64px | Hero/feature spacing |

#### Border Radius

| Token | Value | Use |
|-------|-------|-----|
| --apple-radius-sm | 6px | Buttons, inputs, small elements |
| --apple-radius-md | 10px | Cards, panels |
| --apple-radius-lg | 14px | Modals, large containers |
| --apple-radius-xl | 18px | Feature cards |
| --apple-radius-pill | 9999px | Badges, tags, avatars |

#### Motion

| Token | Value |
|-------|-------|
| --apple-duration-fast | 120ms |
| --apple-duration-normal | 200ms |
| --apple-duration-slow | 320ms |
| --apple-ease-default | cubic-bezier(0.25, 0.1, 0.25, 1) |
| --apple-ease-spring | cubic-bezier(0.34, 1.56, 0.64, 1) |
| --apple-ease-in-out | cubic-bezier(0.4, 0, 0.2, 1) |

#### Scenario: 令牌全部落地为 CSS 自定义属性

- **WHEN** 检查 `apple-design-tokens.css`
- **THEN** 上表全部令牌以 `--apple-*` 自定义属性定义，值与表一致

#### Scenario: 组件消费令牌而非原始值

- **WHEN** 组件需要主操作色 / 表面色 / 间距 / 圆角 / 动效
- **THEN** 通过 `var(--apple-*)` 引用令牌，不硬编码 hex / px 原始值

### Requirement: 组件视觉默认值

共享组件 SHALL 采用以下视觉默认值，且保持现有 props/emits API 不变（非 BREAKING）：

#### UiButton

- primary: var(--apple-accent) fill, white text, var(--apple-radius-sm) radius, var(--apple-space-3) var(--apple-space-5) padding
- secondary: transparent fill, var(--apple-accent) text + border, same radius/padding
- ghost: transparent, no border, var(--apple-ink-secondary) text, hover var(--apple-surface-tertiary) bg
- danger: var(--apple-error) fill, white text (reserved for destructive actions only)

#### UiInput

- Border: 1px solid var(--apple-border), radius var(--apple-radius-sm)
- Focus: 2px solid var(--apple-accent) ring, no heavy shadow
- Placeholder: var(--apple-ink-tertiary)

#### UiCard

- Background: var(--apple-surface-primary), border 1px solid var(--apple-border-subtle)
- Radius: var(--apple-radius-md), shadow: none (border-based definition)
- Hover: subtle var(--apple-shadow-sm) elevation lift

#### UiBadge

- Small, pill-shaped, var(--apple-radius-pill)
- Background: semantic color at 10% opacity, text at full opacity

#### UiModal

- Overlay: rgba(0,0,0,0.3) with var(--apple-duration-normal) fade-in
- Content: var(--apple-radius-lg), var(--apple-shadow-lg)
- Title: var(--apple-size-lg), var(--apple-weight-semibold)

#### Scenario: 视觉默认值更新且 API 不变

- **WHEN** UiButton / UiInput / UiCard / UiBadge / UiModal 按上述默认值更新视觉
- **THEN** 组件现有 props/emits 契约不变，既有调用方无需改动

### Requirement: 布局原则

桌面端布局 SHALL 遵循：侧边栏 240px 固定宽（`--apple-surface-secondary` 背景）、模块导航为 navbar 下方水平标签栏（`--apple-surface-primary` 背景）、内容区占满剩余宽度（`--apple-surface-primary` 背景）、内容密集页最大宽度 1200px 居中（auto margins）。信息密度按页面类型分三档；内容层级三级各 SHALL 通过 font-size / weight / color 呈现可区分的视觉权重。

#### Desktop App Layout

1. Sidebar: 240px fixed width, var(--apple-surface-secondary) background
2. Module Nav: Horizontal tab bar below navbar, var(--apple-surface-primary) background
3. Content Area: Full remaining width, var(--apple-surface-primary) background
4. Max Content Width: 1200px for content-heavy pages, centered with auto margins

#### Information Density Rules

- High density (lists, tables): Row height 40px min, compact padding var(--apple-space-2) / var(--apple-space-3)
- Medium density (forms, cards): Row height 48px, standard padding var(--apple-space-3) / var(--apple-space-4)
- Low density (dashboards, overview): Generous padding var(--apple-space-6), section spacing var(--apple-space-8)

#### Content Hierarchy

1. Primary: Page title, main action, active content - bold/large/dark
2. Secondary: Supporting info, form labels, descriptions - regular weight, muted
3. Tertiary: Timestamps, status badges, metadata, helper text - small, lightest color

#### Scenario: 内容密集页宽度约束

- **WHEN** 渲染内容密集页面（表单 / 列表为主）
- **THEN** 内容区最大宽度 1200px 并居中

#### Scenario: 三级内容层级视觉可区分

- **WHEN** 同屏呈现主 / 次 / 三级内容
- **THEN** 三级分别通过 font-size、weight、color 呈现可区分的视觉权重

### Requirement: 状态视觉规范

所有状态 SHALL 使用「图标 + 文字」双通道表达，绝不只靠颜色；状态图标、前景色与背景按状态表取值。

| State | Icon | Color | Background |
|-------|------|-------|------------|
| Success | checkmark | var(--apple-success) | #34C7591A (10% opacity) |
| Warning | triangle | var(--apple-warning) | #FF95001A (10% opacity) |
| Error | circle-x | var(--apple-error) | #FF3B301A (10% opacity) |
| Info | circle-i | var(--apple-accent) | #007AFF1A (10% opacity) |
| Loading | spinner | var(--apple-ink-secondary) | transparent |
| Empty | illustration | var(--apple-ink-tertiary) | var(--apple-surface-secondary) |

#### Scenario: 状态不只靠颜色

- **WHEN** 呈现 Success / Warning / Error / Info / Loading / Empty 任一状态
- **THEN** 同时具备图标与文字（或占位插画），不依赖颜色即可判别状态

### Requirement: 暗色模式语义映射（Future）

全部令牌 SHALL 具备暗色模式等价物，映射按语义进行：表面白 → 近黑（#1C1C1E）、次表面 → 深灰（#2C2C2E）、墨色主 → 近白（#F5F5F7）、墨色次 → 浅灰（#A1A1A6）；强调色 #007AFF SHALL 跨模式保持不变。

#### Scenario: 强调色跨模式不变

- **WHEN** 切换暗色模式
- **THEN** `--apple-accent` 保持 #007AFF

### Requirement: 无障碍对比度

所有颜色对比 SHALL 满足 WCAG 2.1 AA：正文对比 ≥ 4.5:1，大字对比 ≥ 3:1。

#### Scenario: 令牌对比度达标

- **WHEN** 按令牌取值渲染正文与大字
- **THEN** 对比度分别 ≥ 4.5:1 与 ≥ 3:1

### Requirement: 非破坏性令牌迁移

新 Apple 令牌层 SHALL 与既有 Cohere 设计令牌（`cohere-design-system.css`）兼容共存；旧令牌 SHALL NOT 被删除，组件经分层方式渐进采用新令牌。

#### Scenario: 旧令牌不删除

- **WHEN** Apple 令牌层落地后检查 `cohere-design-system.css` 及其消费方
- **THEN** 既有 Cohere 令牌仍然定义，未采用新令牌的组件视觉不回归
