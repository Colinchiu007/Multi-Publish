# ModelProviders.vue UI 设计审查报告

> **Phase 1.3 /plan-design-review** — 质量节拍
> **审查日期**: 2026-07-15
> **审查目标**: `apps/desktop/src/views/ModelProviders.vue`（606 行）
> **审查方法**: 7 维度评估（信息层级 / 交互状态 / 响应式 / 可访问性 / 视觉一致性 / 微交互 / 错误处理）
> **门禁标准**: 7.0/10
> **审查结论**: ❌ **不通过**（综合 4.9/10）— 需 P2 改造后复审

---

## 一、审查范围

### 目标文件
- `apps/desktop/src/views/ModelProviders.vue`（606 行：template 212 + script 50 + CSS 344）
- `apps/desktop/src/composables/useModelProviderCrud.js`（CRUD 逻辑）
- `apps/desktop/electron/services/model-provider-manager.js`（后端 Manager，testConnection 占位）

### 对照基准
- `01-docs/design/model-provider-module-design.md`（Phase 1.1 设计文档，eng-review 8.7/10）
- 设计文档 P2 阶段已要求：API Key 显示遮罩 + safeStorage 不可用 UI 警告

---

## 二、综合评分

| 维度 | 评分 | 关键短板 |
|------|------|---------|
| 1. 信息层级 | 6/10 | API Key 明文显示、models 撑高卡片、status 双指示器混淆 |
| 2. 交互状态 | 5/10 | 加载态简陋、步骤无进度、禁用无降级、测试结果无超时 |
| 3. 响应式 | 4/10 | **零 @media**、固定宽度对话框、窄屏溢出 |
| 4. 可访问性 | 4/10 | 图标无 aria-label、色盲不友好、无 aria-pressed/current/live |
| 5. 视觉一致性 | 6/10 | 硬编码颜色、颜色语义重复、局部样式未抽取 |
| 6. 微交互 | 4/10 | hover 单薄、硬切多、无 :active、rotating 未验证 |
| 7. 错误处理 | 5/10 | 加密失败未处理、表单验证不足、并发无锁 |
| **综合** | **4.9/10** | **低于 7.0 门禁** |

---

## 三、7 维度详细发现

### 维度 1: 信息层级 (Information Hierarchy) — 6/10

**现状评估**：
- 页面头部 → 过滤条 → 卡片网格，三层结构清晰 ✓
- 每张卡片：type-badge + default-badge + status-dot → name → id+status → 3 字段 → 测试结果 → 5 操作按钮

**发现**：

| # | 严重度 | 问题 | 代码位置 |
|---|--------|------|---------|
| 1.1 | P0/安全 | API Key 字段只显示「已配置/未配置」文字，用户无法识别具体哪个 key | 第 74-76 行 |
| 1.2 | P1/语义 | `status-dot`（API Key 配置状态）与 `status-label`（启用/禁用状态）视觉相近但语义不同，易混淆 | 第 52 / 58 行 |
| 1.3 | P1/布局 | `models` 字段可能很长（OpenAI 10+ 模型），会撑高单张卡片破坏网格视觉一致性 | 第 70 行 |
| 1.4 | P2/对比度 | `default-badge` 金色 `#ffd700` 在 dark mode 下对比度不足 | 第 329 行 |
| 1.5 | P2/瞬时 | 测试结果只在卡片底部短暂显示，刷新后丢失，无持久化 | 第 80 行 |

### 维度 2: 交互状态 (Interaction States) — 5/10

**发现**：

| # | 严重度 | 问题 | 代码位置 |
|---|--------|------|---------|
| 2.1 | P1/加载 | `v-if="loading"` 只显示文字「加载中...」，无骨架屏、无 spinner | 第 33 行 |
| 2.2 | P1/进度 | 添加对话框 3 步流程无步骤进度指示器，用户不清楚当前第几步 | 第 112-162 行 |
| 2.3 | P1/无超时 | `testResults[p.id]` 永久保留，测试结果一直显示，需手动刷新才清除 | 第 80 行 |
| 2.4 | P1/降级 | `p.enabled === false` 时卡片本身无视觉降级（无 opacity/grayscale），只有文字提示 | 第 44-105 行 |
| 2.5 | P2/反馈 | 保存成功后对话框直接关闭，无「✓ 已保存」toast 反馈 | template 未见 ElMessage.success |
| 2.6 | P2/hover | card hover 只变 `box-shadow`，无 translateY/border-color 立体反馈 | 第 282-284 行 |
| 2.7 | P2/重试 | 测试失败后无重试按钮，只能再点测试 | 第 80-82 行 |

### 维度 3: 响应式 (Responsiveness) — 4/10

**发现**：

| # | 严重度 | 问题 | 代码位置 |
|---|--------|------|---------|
| 3.1 | P0/溢出 | `grid-template-columns: repeat(auto-fill, minmax(380px, 1fr))` 在 < 380px 窄屏横向滚动 | 第 270 行 |
| 3.2 | P0/固定宽度 | el-dialog 固定 `width="560px"` / `480px` / `400px`，小屏超出视窗 | 第 110/177/199 行 |
| 3.3 | P1/无断点 | 整个 CSS **零** `@media` 查询，无任何响应式适配 | 全文 |
| 3.4 | P1/按钮溢出 | `.card-actions` 5 个图标按钮无 `flex-wrap`，窄屏可能溢出 | 第 84-104 行 |
| 3.5 | P1/过滤条 | 5 个 chip + meta 文字在窄屏换行成多行，但无水平滚动备选 | 第 16-28 行 |

### 维度 4: 可访问性 (Accessibility) — 4/10

**发现**：

| # | 严重度 | 问题 | 代码位置 |
|---|--------|------|---------|
| 4.1 | P0/aria | 5 个图标按钮（⚡✎★⏸✕）只有 `title` 无 `aria-label`，屏幕阅读器不读用途 | 第 85-103 行 |
| 4.2 | P0/色盲 | `status-dot` 只用颜色区分 online/offline，色盲用户无法区分 | 第 52 行 |
| 4.3 | P1/aria | 过滤 chip 的 `active` 状态只用颜色，无 `aria-pressed="true"` | 第 20 行 |
| 4.4 | P1/aria | 添加对话框 3 步无 `aria-current="step"` | 第 112/127/148 行 |
| 4.5 | P1/aria | loading 状态无 `aria-live="polite"`，屏幕阅读器无法感知加载完成 | 第 33 行 |
| 4.6 | P2/对比度 | `--muted` 颜色用于多处次要文字，可能不满足 WCAG AA 4.5:1 | 多处 |
| 4.7 | P2/焦点 | 对话框打开后焦点未显式锁定到首个输入框 | 第 110/177 行 |

### 维度 5: 视觉一致性 (Visual Consistency) — 6/10

**发现**：

| # | 严重度 | 问题 | 代码位置 |
|---|--------|------|---------|
| 5.1 | P1/硬编码 | 类型 badge 5 种颜色硬编码（`#fff3e0`/`#e65100` 等），不使用 CSS 变量，dark mode 需重复定义 | 第 312-322 行 |
| 5.2 | P1/硬编码 | `default-badge` 金色 `#ffd700` 不跟随主题 | 第 329 行 |
| 5.3 | P2/重复 | `#34a853` 同时用于 `status-dot.online` 和 `.field-value.configured`，同一绿色表达两种语义 | 第 360 / 398 行 |
| 5.4 | P2/局部 | 添加对话框的 `category-card` / `preset-item` / `preset-list` 是局部样式，其他页面无法复用 | 第 114-144 行 |
| 5.5 | P2/重复 | `.provider-id code` 与 `.field-value.mono` 都定义 monospace 字体 | 第 347-352 / 394-397 行 |
| 5.6 | P3/不一致 | `cohere-icon-btn-danger` 与 `cohere-btn-danger` 两套 danger 样式 | 第 101 / 205 行 |

### 维度 6: 微交互 (Microinteractions) — 4/10

**发现**：

| # | 严重度 | 问题 | 代码位置 |
|---|--------|------|---------|
| 6.1 | P1/hover | card hover 只 `box-shadow`，无 `translateY(-2px)` + `border-color` 变化 | 第 282-284 行 |
| 6.2 | P1/active | 按钮无 `:active` 状态（应 `transform: scale(0.97)` 提供点击反馈） | 全文 |
| 6.3 | P1/硬切 | 测试结果 `v-if` 直接显示，无淡入过渡 | 第 80 行 |
| 6.4 | P1/硬切 | 添加对话框步骤切换（`v-if="addStep === N"`）无过渡动画 | 第 112/127/148 行 |
| 6.5 | P2/硬切 | loading → content 切换无淡入 | 第 33/36/43 行 |
| 6.6 | P2/瞬时 | 过滤 chip active 状态切换无动画 | 第 20 行 |
| 6.7 | P2/验证 | `.rotating` 类需验证 `@keyframes` 是否定义（CSS 中未见） | 第 87 行 |

### 维度 7: 错误处理 (Error Handling) — 5/10

**发现**：

| # | 严重度 | 问题 | 代码位置 |
|---|--------|------|---------|
| 7.1 | P0/加密 | 设计文档 P2 要求 safeStorage 不可用时 UI 显示警告横幅，现状无此机制 | 缺失 |
| 7.2 | P1/验证 | 添加对话框第 3 步只检查 id/name 必填，未验证 `base_url` 格式（应 `https://` 开头） | 第 148-162 行 |
| 7.3 | P1/验证 | API Key 格式无前端校验（未提示 `sk-` 前缀等） | 第 158 行 |
| 7.4 | P1/并发 | 快速点击「保存」可能触发多次提交（虽有 `submitting` 状态 disable 按钮，但未 disable 整个对话框） | 第 169 行 |
| 7.5 | P2/重试 | testConnection 网络超时后无重试按钮 | 第 80-82 行 |
| 7.6 | P2/提示 | 删除预设错误消息「预设服务商不支持删除，如需移除请禁用该服务商」过长 | manager.js:220 |
| 7.7 | P2/持久 | 测试结果刷新后丢失，无历史记录 | 第 80 行 |

---

## 四、改造建议（按优先级）

### P0 — 安全 & 必须修复（4 项）

1. **API Key 显示遮罩** `sk-****1234`（设计文档已要求）
   - 后端 `listProviders` 返回 `api_key_masked` 字段
   - 前端第 74-76 行改为显示遮罩值
   - composable 适配新字段

2. **safeStorage 不可用 UI 警告横幅**（设计文档审查发现 #6）
   - 顶部显示橙色警告条：「⚠️ 系统加密不可用，API Key 将无法安全存储」
   - 拒绝存储明文（非降级）

3. **图标按钮补 `aria-label`**
   - 5 个图标按钮（⚡✎★⏸✕）添加 `aria-label="测试连接"` 等

4. **status-dot 色盲友好**
   - online 用 ● + 绿色，offline 用 ○ + 灰色（形状区分）

### P1 — UX 关键（9 项）

1. **添加对话框步骤进度指示器**（Step 1/3 → 2/3 → 3/3）
2. **加载状态升级为骨架屏**（3 卡片占位）
3. **禁用卡片视觉降级**（`opacity: 0.6` + `filter: grayscale(0.5)`）
4. **表单验证**：base_url 格式（`https://` 开头）、API Key 格式提示
5. **models 字段截断** + tooltip（最多显示 3 个，其余 +N）
6. **响应式断点** `@media (max-width: 768px)`：网格改单列、对话框 90vw
7. **card hover 微动效**（`translateY(-2px)` + `border-color` 变化）
8. **测试结果超时自动清理**（30s 后淡出）
9. **保存成功 toast** `ElMessage.success('已保存')`

### P2 — 体验提升（6 项）

1. 类型 badge 颜色改用 CSS 变量（消除硬编码）
2. `default-badge` dark mode 适配
3. 测试结果淡入过渡（`transition: opacity 0.3s`）
4. 步骤切换过渡动画（`<transition>` 组件）
5. 过滤 chip `aria-pressed` + 步骤 `aria-current="step"` + loading `aria-live="polite"`
6. 测试失败重试按钮

### P3 — 抛光（3 项）

1. 测试结果持久化（localStorage）
2. 焦点管理（对话框打开聚焦首输入框）
3. 抽取 `category-card` / `preset-item` 到全局 cohere 系统

---

## 五、与设计文档差距分析

### 设计文档 P2 阶段已覆盖（2 项）
- ✅ API Key 显示遮罩（`ModelProviders.vue` P2 改造）
- ✅ safeStorage 不可用 UI 警告（审查发现 #6）

### 本次审查新增发现（19 项，设计文档未覆盖）
- **P0**: 4 项（aria-label、色盲友好）
- **P1**: 9 项（骨架屏、步骤进度、响应式、表单验证等）
- **P2**: 6 项（过渡动画、CSS 变量化等）

### 建议
将本次审查发现整合到设计文档「P2 阶段 UI 改造」章节，扩展为完整的 UI 改造清单。P2 实施时按 P0 → P1 → P2 → P3 顺序执行。

---

## 六、复审条件

P2 改造完成后需复审，通过条件：
1. P0 全部 4 项修复
2. P1 至少 6/9 项修复
3. 综合评分 ≥ 7.0/10
4. 响应式 + 可访问性维度各自 ≥ 6/10

---

**审查人**: Phase 1.3 /plan-design-review
**下一步**: 整合到 `model-provider-module-design.md`，进入 P2 实施阶段
