# Multi-Publish 官网 Cohere 风格设计规范 v1.0

> 基于 https://cohere.com/ 官网视觉语言，为 Multi-Publish 官网制定的专项设计规范
> 配套文档：[WEBSITE-PLAN.md](WEBSITE-PLAN.md) — 官网完整方案
> 原型文件：[website-home-cohere.html](website-home-cohere.html)
> 文档日期：2026-07-26

---

## 1. 设计原则

### 核心调性

- **极简留白**：大段呼吸空间，内容密度低，信息层级清晰
- **浅色为主**：白色 + 暖灰色背景，营造信任感与专业感
- **圆润友好**：大圆角按钮（pill）+ 中等圆角卡片（22px），降低工具冰冷感
- **字体对比**：几何感标题字体 + 清晰正文字体
- **珊瑚点缀**：少量高饱和珊瑚色作为强调，呼应 AI 与创造力
- **精致动效**：悬浮缩放、柔和过渡、滚动渐显，不喧宾夺主

### 与 Cohere 的对应关系

| Cohere 元素 | Multi-Publish 适配 |
|------------|-------------------|
| "Own your AI" 大标题 | "From Idea to Everywhere" |
| 数据/基础设施叙事 | 内容工作站/多平台分发叙事 |
| 珊瑚-紫-蓝渐变 | 珊瑚色（#ff7759）+ 深绿（#003c33）+ 动作蓝（#1863dc） |
| 客户 logo 墙 | 平台 logo 墙 + 早期客户 logo |
| 3 列功能卡片 | 6 大功能卡片 |
| 产品切换 tab | 平台/AI/视频能力展示 |
| 深色 newsletter footer | 深色 CTA footer |

---

## 2. 色彩系统

### 主色调

```yaml
primary: "#17171c"          # 近黑主色，用于标题、按钮、强文本
black: "#000000"            # 纯黑，极少使用
ink: "#212121"              # 正文主色
white: "#ffffff"            # 背景、反白文字
```

### 背景色

```yaml
canvas: "#ffffff"           # 主背景
soft-stone: "#eeece7"       # 次要背景 / hover 背景 / 徽章背景
pale-green: "#edfce9"       # 成功/开源氛围卡片背景
pale-blue: "#f1f5ff"        # AI/技术氛围卡片背景
dark-navy: "#071829"        # 深色区块 / footer 背景（可配合渐变）
deep-green: "#003c33"       # 品牌深色强调，可用于 footer 渐变
```

### 中性色

```yaml
hairline: "#d9d9dd"         # 分割线、细边框
border-light: "#e5e7eb"     # 卡片边框、输入框边框
card-border: "#f2f2f2"      # 极浅卡片边框
muted: "#93939f"            # 次要文字、图标
slate: "#75758a"            # 辅助说明
body-muted: "#616161"       # 描述文字
```

### 强调色

```yaml
coral: "#ff7759"            # 主强调色（CTA、高亮、装饰点）
coral-soft: "#ffad9b"       # 珊瑚浅色，hover 背景
action-blue: "#1863dc"      # 链接、次要 CTA
focus-blue: "#4c6ee6"       # 聚焦状态
form-focus: "#9b60aa"       # 表单聚焦（紫）
```

### 渐变

```yaml
hero-gradient: "radial-gradient(ellipse at 70% 20%, rgba(255,119,89,0.08) 0%, transparent 50%), radial-gradient(ellipse at 30% 80%, rgba(24,99,220,0.06) 0%, transparent 50%)"
footer-gradient: "linear-gradient(135deg, #003c33 0%, #071829 100%)"
cta-gradient: "linear-gradient(135deg, #ff7759 0%, #9b60aa 50%, #1863dc 100%)"
```

### 使用规则

- **标题**：`#17171c` 或 `#000000`
- **正文**：`#212121`
- **次要/说明文字**：`#616161` / `#75758a` / `#93939f`
- **主 CTA 按钮**：`#17171c` 背景 + 白色文字，hover 纯黑
- **强调 CTA**：`#ff7759` 背景 + 深色文字，hover 加深
- **链接**：`#1863dc`，无下划线，hover 加深
- **背景**：以 `#ffffff` 为主，区块间用 `#eeece7` 或渐变区分
- **深色区块**：Footer 使用 `#003c33 → #071829` 渐变

---

## 3. 字体系统

### 字体族

```yaml
heading-font: "'Space Grotesk', 'Inter', ui-sans-serif, system-ui, sans-serif"
body-font: "'Inter', 'Arial', ui-sans-serif, system-ui, sans-serif"
mono-font: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace"
```

> Cohere 官网使用 Unica77 Cohere Web（定制字体），我们用 Space Grotesk 作为最接近的免费替代，几何感强且开源。

### 字号阶梯

```yaml
hero-title: "64px / 1.05 / -0.03em"     # 首屏大标题（桌面）
hero-title-mobile: "40px / 1.1 / -0.02em" # 移动端
section-title: "40px / 1.15 / -0.02em"   # 区块标题
section-title-mobile: "28px / 1.2"       # 移动端
subsection-title: "24px / 1.3"           # 子区块标题
card-title: "18px / 1.4"                 # 卡片标题
body-large: "18px / 1.6"                 # 引导段落
body: "16px / 1.6"                       # 正文
body-small: "14px / 1.5"                 # 辅助说明、标签
caption: "12px / 1.4"                    # 小标签、uppercase
```

### 字重

```yaml
regular: 400
medium: 500
semibold: 600
```

### 字体使用规则

- **Hero 标题**：Space Grotesk, 64px, 500, letter-spacing -0.03em
- **区块标题**：Space Grotesk, 40px, 500, letter-spacing -0.02em
- **正文**：Inter, 16-18px, 400, line-height 1.6
- **按钮**：Inter, 14-16px, 500
- **标签/小字**：Inter, 12px, 500, uppercase, letter-spacing 0.5px
- **代码/技术细节**：JetBrains Mono, 14px

---

## 4. 间距系统

```yaml
xxs: 2px
xs: 6px
sm: 8px
md: 12px
lg: 16px
xl: 24px
xxl: 32px
3xl: 48px
4xl: 64px
5xl: 96px
6xl: 128px
section-gap: 160px      # 区块上下内边距（桌面）
section-gap-mobile: 80px # 移动端
content-max-width: 1280px
narrow-max-width: 720px
```

### 使用规则

- **页面左右内边距**：桌面 48px，平板 24px，移动端 16px
- **Hero 上下内边距**：160px
- **普通区块上下内边距**：120-160px
- **卡片内边距**：24-32px
- **网格间距**：24px（桌面），16px（移动端）
- **标题与段落间距**：16-24px

---

## 5. 圆角系统

```yaml
xs: 4px       # 小标签、输入框
sm: 8px       # 小按钮、图标容器
md: 16px      # 卡片、代码块
lg: 22px      # 大卡片、图片容器
xl: 30px      # 大按钮、feature 区块
pill: 9999px  # CTA 按钮、胶囊标签
```

### 使用规则

- **Primary CTA 按钮**：`border-radius: 9999px`（pill）
- **Secondary CTA 按钮**：`border-radius: 9999px` 或 30px
- **功能卡片**：`border-radius: 22px`
- **小卡片/徽章**：`border-radius: 8px`
- **图片/视频容器**：`border-radius: 22px`
- **输入框**：`border-radius: 8px`

---

## 6. 阴影与边框

```yaml
shadow-none: "none"                   # 主风格无阴影
shadow-card: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)"  # 极轻
shadow-hover: "0 8px 30px rgba(0,0,0,0.08)"  # 悬浮
border-card: "1px solid #f2f2f2"      # 卡片边框
border-light: "1px solid #e5e7eb"     # 输入框/分割线
border-hairline: "1px solid #d9d9dd"  # 导航底部、细分割线
```

### 使用规则

- **卡片**：默认 1px `#f2f2f2` 边框，无阴影或极轻阴影
- **卡片 hover**：背景变为 `#eeece7`，可轻微上移 2-4px
- **导航**：底部 1px `#d9d9dd` 边框
- **输入框**：1px `#e5e7eb` 边框，focus 变为 `#9b60aa`
- **按钮**：无阴影，依靠颜色和形状区分

---

## 7. 按钮组件

### Primary Button（主 CTA）

```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  padding: 0 28px;
  background: #17171c;
  color: #ffffff;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 500;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
  transition: all 0.25s ease;
}

.btn-primary:hover {
  background: #000000;
  transform: translateY(-1px);
}
```

### Secondary Button（次 CTA / 文字按钮）

```css
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 4px;
  background: transparent;
  color: #17171c;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: color 0.2s ease;
}

.btn-secondary:hover {
  color: #1863dc;
}
```

### Outline Button（描边按钮）

```css
.btn-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  padding: 0 24px;
  background: transparent;
  color: #17171c;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  border: 1.5px solid #17171c;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.25s ease;
}

.btn-outline:hover {
  background: #17171c;
  color: #ffffff;
}
```

### Coral Button（强调/限时按钮）

```css
.btn-coral {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  padding: 0 28px;
  background: #ff7759;
  color: #17171c;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 500;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
  transition: all 0.25s ease;
}

.btn-coral:hover {
  background: #ffad9b;
  transform: translateY(-1px);
}
```

---

## 8. 卡片组件

### Feature Card（功能卡片）

```css
.feature-card {
  background: #ffffff;
  border: 1px solid #f2f2f2;
  border-radius: 22px;
  padding: 32px;
  transition: all 0.3s ease;
}

.feature-card:hover {
  background: #eeece7;
  transform: translateY(-4px);
  border-color: #eeece7;
}
```

### Pricing Card（价格卡片）

```css
.pricing-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 22px;
  padding: 40px 32px;
  transition: all 0.3s ease;
}

.pricing-card.featured {
  border-color: #17171c;
  background: #fafafa;
}

.pricing-card:hover {
  border-color: #17171c;
}
```

### Logo Card（平台/客户 logo 卡片）

```css
.logo-card {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  padding: 20px;
  background: #ffffff;
  border: 1px solid #f2f2f2;
  border-radius: 16px;
  transition: all 0.25s ease;
}

.logo-card:hover {
  border-color: #d9d9dd;
}
```

---

## 9. 导航组件

### 顶部导航

```css
.top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 72px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid transparent;
  z-index: 1000;
  transition: border-color 0.3s ease;
}

.top-nav.scrolled {
  border-bottom-color: #d9d9dd;
}
```

### 导航链接

```css
.nav-link {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #616161;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.nav-link:hover {
  color: #17171c;
  background: #eeece7;
}
```

### 移动端菜单

- 汉堡图标
- 全屏/侧滑菜单
- 白色背景
- 大字号链接

---

## 10. 动效规范

### 进入动效

```css
/* 元素进入视口时 */
.fade-in-up {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.fade-in-up.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### 悬浮动效

```css
/* 按钮 */
.btn-primary:hover {
  transform: translateY(-1px);
}

/* 卡片 */
.feature-card:hover {
  transform: translateY(-4px);
}

/* 链接带箭头 */
.link-arrow:hover .arrow {
  transform: translateX(4px);
}
```

### 背景动效

- Hero 区可使用 subtle gradient mesh 或 radial gradient
- 避免强动画，保持优雅
- 平台 logo 可水平缓慢滚动（marquee）

### 过渡时间

```yaml
fast: 150ms    # hover 颜色变化
normal: 250ms  # 按钮、卡片悬浮
slow: 400ms    # 页面进入、大元素过渡
entrance: 600ms # 滚动渐显
```

---

## 11. 首页页面结构（Cohere 风格适配）

### 结构清单

```
1. 固定导航栏（白色背景 + blur + 底部细线）
2. Hero 首屏（白色背景 + 渐变光晕）
   - 顶部小徽章（MIT 开源 / v2.4.0）
   - 大标题 From Idea to Everywhere
   - 副标题 + 核心价值点
   - 双 CTA（Primary + Secondary）
   - 信任指标（15+ 平台 / 50+ AI / 13 视频管线）
3. 平台 logo 墙（marquee 滚动）
4. 痛点共鸣区（soft-stone 背景）
5. 功能展示区（6 大卡片，3 列网格）
6. AI 能力展示（pale-blue 背景卡片）
7. 视频创作展示（大卡片 + 样片占位）
8. 安全与开源区（deep-green 渐变文字或卡片）
9. 竞品对比区（简洁表格）
10. 价格区（3 张价格卡片）
11. 用户证言区（soft-stone 背景）
12. CTA 区（coral 渐变背景）
13. Footer（deep-green → dark-navy 渐变）
```

---

## 12. 响应式断点

```yaml
mobile: 640px
 tablet: 768px
 laptop: 1024px
 desktop: 1280px
 wide: 1536px
```

### 关键响应式规则

- **导航**：1024px 以下切换为汉堡菜单
- **Hero 标题**：64px → 48px → 40px
- **功能卡片网格**：3 列 → 2 列 → 1 列
- **价格卡片**：3 列 → 1 列（featured 居中）
- **左右布局**：桌面左文右图 → 移动端上下堆叠
- **区块内边距**：160px → 120px → 80px
- **左右页面边距**：48px → 24px → 16px

---

## 13. 图片与视觉资产

### 需要的图片资产

| 资产 | 用途 | 规格 |
|------|------|------|
| Hero 产品截图 | 首屏右侧展示 | 1200×900px, 圆角 22px |
| 平台 logo SVG | logo 墙 + 卡片 | 24×24px / 40×40px |
| AI Provider logo | AI 能力区 | 32×32px 灰度/彩色 |
| 功能截图 6 张 | 功能卡片配图 | 600×400px |
| 视频样片封面 4 张 | 视频创作区 | 800×450px |
| 用户头像 3 张 | 证言区 | 64×64px 圆形 |
| 客户/团队 logo | 信任徽章区 | 高度 24px SVG |

### 图片处理规则

- 所有图片使用 WebP 格式
- 圆角 22px（大）或 16px（中）
- 产品截图加极轻阴影
- Logo 优先 SVG，保持单色或品牌色

---

## 14. 与现有 WEBSITE-PLAN.md 的对应关系

| WEBSITE-PLAN.md | 本规范落地 |
|-----------------|-----------|
| 深色模式优先 → 浅色模式自动切换 | **改为浅色模式为主**（Cohere 风格） |
| 紫蓝渐变品牌色 | **改为珊瑚色 + 深绿 + 动作蓝** |
| Inter + Noto Sans SC | **Space Grotesk + Inter + Noto Sans SC** |
| 卡片圆角 12px | **改为 22px** |
| 按钮圆角 8px | **改为 9999px pill** |
| 紫色粒子背景 | **改为 subtle radial gradient** |
| 页面结构 14 区块 | **保留结构，适配 Cohere 视觉语言** |

---

## 15. 实现文件

| 文件 | 说明 |
|------|------|
| [website-home-cohere.html](website-home-cohere.html) | 可直接打开的首页 HTML/CSS/JS 原型 |
| [WEBSITE-DESIGN-COHERE.md](WEBSITE-DESIGN-COHERE.md) | 本设计规范文档 |
| [WEBSITE-PLAN.md](WEBSITE-PLAN.md) | 官网完整方案（含文案和结构） |

---

## 16. 维护规则

- 本规范为 Multi-Publish 官网 Cohere 风格的**唯一设计基准**
- 任何官网视觉调整需同步更新本规范
- 修改需 PR Review + 至少 1 名核心维护者批准
- 版本号变更需在文末附 changelog

---

## Changelog

- **v1.0（2026-07-26）**：首次发布，基于 cohere.com 官网视觉语言制定
