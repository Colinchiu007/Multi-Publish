# Multi-Publish 设计系统组件使用指南

> **版本**: v1.0 | **最后更新**: 2026-07-07
> **配套文档**: `DESIGN.md`（色彩/字体/间距完整规范）

---

## 一、组件概览

| 组件 | Props | Emits | Slots | 测试 | 状态 |
|------|-------|-------|-------|------|------|
| **UiButton** | variant, size, disabled, tag | click | default | ✅ | 稳定 |
| **UiBadge** | (无) | — | default | ✅ | 稳定 |
| **UiCard** | (无) | — | default, header, footer | ✅ | 稳定 |
| **UiInput** | modelValue, placeholder, type, disabled, readonly | update:modelValue | — | ✅ | 稳定 |
| **UiModal** | modelValue | update:modelValue | default, title | ✅ | 稳定 |
| **UiSelect** | modelValue, options, placeholder, disabled | update:modelValue | — | ✅ | 稳定 |

---

## 二、组件 API 规范

### 2.1 命名约定

- **Props**: camelCase（`modelValue`, `placeholder`）
- **Emits**: kebab-case 事件（`click`, `update:modelValue`）
- **Slots**: kebab-case（`header`, `footer`）
- **CSS class**: `ui-{name}` 前缀（`ui-btn`, `ui-card`）
- **CSS 变量**: `--{name}`（`--primary`, `--shadow-lg`）

### 2.2 通用 Props

所有表单类组件（UiInput, UiSelect）应支持：
- `modelValue` — v-model 绑定值
- `disabled` — 禁用状态
- 通过 `update:modelValue` emit 实现双向绑定

### 2.3 通用行为

- 禁用状态：添加 `disabled` class + `opacity: 0.5; cursor: not-allowed`
- 聚焦状态：`outline` + `box-shadow` 统一使用 `--primary` 色
- 过渡动画：统一 `transition: all 150ms ease-out`

---

## 三、组件详解

### 3.1 UiButton

```vue
<UiButton variant="primary" size="md" @click="handleClick">发布</UiButton>
<UiButton variant="secondary" size="sm">取消</UiButton>
<UiButton variant="ghost" size="lg">更多</UiButton>
<UiButton variant="danger">删除</UiButton>
<UiButton :disabled="true">不可用</UiButton>
```

| Prop | 类型 | 默认值 | 可选值 |
|------|------|--------|--------|
| variant | String | "primary" | primary, secondary, ghost, danger |
| size | String | "md" | sm, md, lg |
| disabled | Boolean | false | — |
| tag | String | "button" | button, a, span |

### 3.2 UiInput

```vue
<UiInput v-model="text" placeholder="输入标题" />
<UiInput v-model="email" type="email" :disabled="sending" />
```

| Prop | 类型 | 默认值 |
|------|------|--------|
| modelValue | String/Number | — |
| placeholder | String | "" |
| type | String | "text" |
| disabled | Boolean | false |
| readonly | Boolean | false |

### 3.3 UiSelect

```vue
<UiSelect v-model="platform" :options="platforms" placeholder="选择平台" />
```

| Prop | 类型 | 默认值 |
|------|------|--------|
| modelValue | String | — |
| options | Array | [] |
| placeholder | String | "请选择" |
| disabled | Boolean | false |

### 3.4 UiModal

```vue
<UiModal v-model="show">
  <template #title>确认发布</template>
  <p>确定要将内容发布到上述平台？</p>
</UiModal>
```

| Prop | 类型 | 默认值 |
|------|------|--------|
| modelValue | Boolean | false |

### 3.5 UiBadge

```vue
<UiBadge>新功能</UiBadge>
```

纯展示组件，嵌套在 UiCard 中使用。

### 3.6 UiCard

```vue
<UiCard>
  <template #header>数据概览</template>
  <p>卡片内容...</p>
  <template #footer><UiButton>查看详情</UiButton></template>
</UiCard>
```

---

## 四、CSS 变量参考

```css
/* 颜色 */
--primary: #7c5cbf;        /* 浅薰衣草紫 */
--primary-hover: #6a4dab;
--primary-light: #f0ebff;
--secondary: #f472b6;      /* 粉色点缀 */
--text: #1e1b4b;
--text-muted: #7c7c9a;
--border: #e0d8f0;
--border-light: #f0ebff;
--success: #34d399;
--warning: #fbbf24;
--error: #f87171;
--bg: #f8f4ff;
--surface: #ffffff;

/* 圆角 */
--r-sm: 6px;
--r-md: 10px;
--r-lg: 16px;

/* 阴影 */
--shadow-sm: 0 1px 3px rgba(124, 92, 191, 0.08);
--shadow-md: 0 4px 12px rgba(124, 92, 191, 0.12);
--shadow-lg: 0 8px 30px rgba(124, 92, 191, 0.16);
```

---

## 五、组件开发规范

### 5.1 新增组件检查清单

- [ ] 使用 `<script setup>` Composition API
- [ ] Props 使用 `defineProps` + 默认值
- [ ] Emits 使用 `defineEmits`
- [ ] CSS class 前缀 `ui-{name}`
- [ ] 样式使用 scoped
- [ ] 引用 CSS 变量而非硬编码颜色
- [ ] 支持 v-model（表单类组件）
- [ ] 有对应的 `.test.js` 测试文件
- [ ] 至少覆盖：渲染、Props、Emits 三类测试

### 5.2 组件目录

```
src/components/
  Ui{Name}.vue       # 组件
  Ui{Name}.test.js   # 单元测试
```

### 5.3 测试模式

```js
import { mount } from "@vue/test-utils";
import UiButton from "./UiButton.vue";

it("renders with variant", () => {
  const w = mount(UiButton, { props: { variant: "danger" } });
  expect(w.classes()).toContain("ui-btn-danger");
});

it("emits click on click", async () => {
  const w = mount(UiButton);
  await w.trigger("click");
  expect(w.emitted("click")).toBeTruthy();
});
```

---

*本指南基于 `apps/desktop/src/components/Ui*` 组件族生成。*
