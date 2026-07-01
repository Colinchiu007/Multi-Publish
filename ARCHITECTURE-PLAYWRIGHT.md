# PROJECT-003 浏览器发布引擎架构方案

> **Playwright + AI 韧性层**
> 日期: 2026-06-06 | 状态: 待评审

---

## 一、整体架构

```
┌──────────────────────────────────────────────────┐
│              PublisherManager                     │
│  任务队列 · 调度 · 状态追踪 · 失败重试             │
├──────────────────────────────────────────────────┤
│              BrowserEngine                       │
│  (Playwright + 反检测 + Cookie持久化 + 网络拦截)   │
├──────────────────────────────────────────────────┤
│     PlatformPublisher (各平台适配器)               │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │
│  │ 知乎    │  │ 微博    │  │ 抖音    │  │ 百家号  │  │
│  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  │
│       └───────────┬───────────┬───────────┘       │
│                   ▼                                │
│           SelectorEngine                           │
│  主路径: 预定义选择器 ⚡ 快                        │
│  Fallback: AI 韧性层 🧠 稳                         │
└──────────────────────────────────────────────────┘
```

---

## 二、核心模块设计

### 模块 1: BrowserEngine

Playwright 浏览器引擎，统一管理浏览器生命周期。

```python
class BrowserEngine:
    """统一的 Playwright 浏览器引擎"""
    
    async def start(self, headless: bool = False) -> Browser:
        """启动浏览器实例"""
    
    async def close(self):
        """关闭浏览器"""
    
    async def new_context(self, cookies_file: str) -> BrowserContext:
        """创建隔离上下文(每个平台一个,防止Cookie串扰)"""
    
    async def navigate(self, url: str, wait_until: str = "networkidle"):
        """导航到目标页面"""
```

**关键设计决策：**

| 决策 | 方案 |
|------|------|
| 浏览器实例 | 全局唯一实例，每个平台一个 `BrowserContext`（Cookie 隔离） |
| 启动方式 | 默认 `headless=False`（需要可视化调试），可选 `headless` |
| 用户数据目录 | 固定持久化目录（免去重复登录） |
| 反检测 | `stealth` 插件 + 代理注入 + WebDriver 检测绕过 |
| 超时控制 | 全局 30s，可逐操作覆盖 |

**Selenium → Playwright 迁移映射：**

| Selenium | Playwright | 优势 |
|----------|------------|------|
| `WebDriverWait(driver, 10).until(...)` | `page.wait_for_selector(selector, timeout=10000)` | 更简洁，原生 async |
| `driver.find_element(By.XPATH, xpath)` | `page.locator(xpath).click()` | auto-wait 内置 |
| `ActionChains(driver).move_to_element(...)` | `element.hover()` | 更直观 |
| `driver.execute_script(...)` | `page.evaluate(...)` | 同能力 |
| `driver.get_cookies()` | `context.cookies()` | 更结构化 |

---

### 模块 2: PlatformPublisher（各平台适配器）

继承现有的 `BasePublisher` 抽象接口：

```python
class ZhihuPublisher(BaseRpaPublisher):
    """知乎发布器 (Playwright RPA)"""
    
    async def initialize(self):
        self.engine = await BrowserEngine.start()
        self.ctx = await self.engine.new_context("zhihu_cookies.json")
        self.page = await self.ctx.new_page()
    
    async def publish(self, title, content, **kwargs):
        # 1. 导航到发布页
        await self.page.goto("https://zhuanlan.zhihu.com/write")
        
        # 2. 填标题 — 使用 SelectorEngine
        title_input = await SelectorEngine.find(self.page, "zhihu_title")
        await title_input.fill(title)
        
        # 3. 填正文
        editor = await SelectorEngine.find(self.page, "zhihu_editor")
        await editor.fill(content)
        
        # 4. 设封面 (可选)
        if kwargs.get("cover_image"):
            add_btn = await SelectorEngine.find(self.page, "zhihu_cover_btn")
            await add_btn.click()
            ...
        
        # 5. 点发布
        publish_btn = await SelectorEngine.find(self.page, "zhihu_publish_btn")
        await publish_btn.click()
        
        return PublishResult(platform=PlatformType.ZHIHU, success=True, ...)
```

**各平台选择器配置文件（`selectors.yaml`）：**

```yaml
zhihu:
  title_input: 'div[contenteditable="true"][placeholder*="标题"]'
  editor: '#editor-content'
  cover_btn: 'button:has-text("添加封面")'
  cover_selector: '//div[contains(@class, "image-item")]'
  publish_btn: 'button:has-text("发布")'
  dialog_publish: 'div.dialog button:has-text("确认发布")'
  
weibo:
  title_input: '#publisher_title'
  editor: '#publisher_content'
  publish_btn: 'button:has-text("发布微博")'
  ...

douyin:
  title_input: 'input[placeholder*="标题"]'
  ...
```

---

### 模块 3: SelectorEngine（选择器引擎）— 核心创新

```python
class SelectorEngine:
    """
    三层级选择器引擎
    
    Level 1: 预定义选择器 (主路径, ⚡ 快)
    Level 2: 语义fallback (内置Playwright text= / role= 选择器)
    Level 3: AI看图定位 (🧠 最后手段)
    """
    
    @staticmethod
    async def find(page, element_key: str, timeout: int = 5000):
        """查找页面元素, 自动降级"""
        
        # Level 1: 配置中的主选择器
        primary = await SelectorEngine._try_primary(page, element_key)
        if primary: return primary
        
        # Level 2: 语义fallback (text= / role= / placeholder)
        fallback = await SelectorEngine._try_semantic(page, element_key)
        if fallback: return fallback
        
        # Level 3: AI看图定位 (仅当Level1+2都失败)
        return await SelectorEngine._try_ai(page, element_key)
```

**AI 韧性层（模块 4）详细设计在后文。**

---

### 模块 4: AIResilienceLayer（AI 韧性层）

这是本方案的核心差异化能力，**非每步调用**，仅在主选择器失效时触发。

```
触发条件                           →
────────────────────────────────────┐
  主选择器 timeout × 3 (超时3次)    →  Level 1 重新获取页面 → 重试
  页面元素状态异常                   →  Level 2 语义匹配
  平台改版 (DOM 大变)               →  Level 3 AI 接手
                                    └───────────────────────
                                          进入"AI 分析模式"
```

**AI 韧性层的内部流程：**

```python
class AIResilienceLayer:
    """
    AI 看图定位引擎
    
    当 SelectorEngine 的 Level 1+2 都失败时启用。
    核心流程: 截图 → LLM 分析 → 定位 → 缓存
    """
    
    async def locate(self, page, element_desc: str, screenshot=None):
        """
        通过 AI 分析截图，定位元素坐标
        
        参数:
            page: Playwright page 对象
            element_desc: 元素语义描述 (如"发布按钮")
            screenshot: 可选的截图(不传则自动截取)
        
        返回:
            成功: {selector: "xpath", confidence: 0.95}
            失败: None
        """
        # 1. 截取当前页面
        ss = screenshot or await page.screenshot()
        
        # 2. 调 LLM 分析截图 (视觉模型)
        #    输入: 截图 + "请定位文章发布按钮的位置"
        #    输出: {x, y, w, h, confidence, css_selector}
        result = await self._llm_analyze(ss, element_desc)
        
        if result.confidence < 0.5:
            return None
        
        # 3. 生成兼容的选择器
        selector = result.css_selector
        
        # 4. 缓存到本地 (下次不用再调 AI)
        await self._cache_selector(element_desc, selector)
        
        return {"selector": selector, "confidence": result.confidence}
    
    async def _llm_analyze(self, screenshot, desc):
        """
        调用视觉LLM分析截图
        
        支持模型:
        1. GPT-4o (最佳, 但贵)
        2. Claude 3.5 Sonnet (推荐)
        3. Gemini Flash (便宜够用)
        
        Prompt 设计:
        ```
        你是一个浏览器自动化助手。分析这张截图，找到"{desc}"元素。
        返回JSON: {{
            "exists": boolean,
            "css_selector": "最精确的CSS选择器",
            "xpath": "最精确的XPath",
            "confidence": 0.0-1.0,
            "text_match": "元素的可见文本(用于text=选择器)",
            "role": "元素的ARIA role",
        }}
        
        规则:
        - 优先用 text= 或 role= 选择器(更稳定)
        - CSS选择器次之
        - XPath兜底(最脆弱)
        - confidence < 0.5 不要返回
        ```
        """
        # 调模型路由(复用PROJECT-001的LLMClient)
        ...
    
    async def _cache_selector(self, element_key, selector):
        """
        缓存AI发现的选择器到本地
        
        存储: selectors/ai_cache.yaml
        格式:
        {element_key}_zhihu:
          selector: "button:has-text('发布')"
          discovered: "2026-06-06"
          success_count: 1
          confidence: 0.92
        """
        ...
```

---

## 三、发布流程（完整时序）

```
用户/系统
   │
   ├─ 请求发布 {title, content, platforms: [知乎, 微博]}
   │
   ▼
PublisherManager
   │
   ├─ BrowserEngine.start() ── 启动 Playwright
   │
   ├─ 并行执行:
   │   ├─ PlatformPublisher[知乎].publish()
   │   │     ├─ navigate(知乎发布页)
   │   │     ├─ SelectorEngine.find("title_input") ── Level 1 → ✅
   │   │     ├─ SelectorEngine.find("editor")      ── Level 1 → ✅
   │   │     ├─ SelectorEngine.find("publish_btn") ── Level 1 → ❌ (平台改版!)
   │   │     │     └─ Level 2 (text=) → ❌
   │   │     │           └─ AIResilienceLayer.locate("发布按钮") 
   │   │     │                 └─ LLM 看图 → 找到新按钮 → 缓存选择器
   │   │     └─ click publish_btn → ✅ 发布成功
   │   │
   │   └─ PlatformPublisher[微博].publish()
   │         ├─ ...
   │         └─ ✅ 发布成功
   │
   └─ BrowserEngine.close()
   │
   ▼
返回 PublishResult(success=True, details={...})
```

---

## 四、与现有系统集成

### 4.1 目录结构

```
PROJECT-003-multi-publish/
├── src/multi_publish/
│   ├── publishers/
│   │   ├── base.py              ← 现有的 BasePublisher (不变)
│   │   ├── base_rpa.py          ← 新增: RPA 发布器基类(继承BasePublisher)
│   │   ├── wechat_mp.py         ← 现有: 微信公众号API版(不变)
│   │   ├── zhihu.py             ← 新增: 知乎 Playwright RPA
│   │   ├── weibo.py             ← 新增: 微博 Playwright RPA
│   │   └── douyin.py            ← 新增: 抖音 Playwright RPA
│   ├── rpa/
│   │   ├── browser_engine.py    ← 新增: Playwright 浏览器引擎
│   │   ├── selector_engine.py   ← 新增: 三层选择器引擎
│   │   ├── selectors.yaml       ← 新增: 平台选择器配置
│   │   └── ai_resilience.py     ← 新增: AI 韧性层
│   └── ...
```

### 4.2 依赖变更

```toml
# 新增依赖
playwright>=1.40
# 可选 (AI韧性层)
openai>=1.0           # 或直接用 LLMClient
```

### 4.3 缓存的配置路径

```yaml
# config.yaml 新增
rpa:
  headless: false
  user_data_dir: "./data/playwright/userdata"
  timeout: 30000
  ai_fallback:
    enabled: true
    provider: "sensenova"     # 复用现有模型路由
    model: "deepseek-v4-flash" # 有视觉能力即可
    confidence_threshold: 0.7
  retry:
    max_retries: 3
    fallback_to_ai_after: 2    # 重试2次仍失败 → AI接手
```

---

## 五、AI 韧性层的成本估算

> **关键原则**: AI 不参与正常路径，只做异常恢复。正常发布零成本。

| 场景 | 频率 | LLM调用 | 每次成本 | 月成本 |
|------|------|---------|---------|--------|
| 正常发布 | 95% | 0次 | ¥0 | ¥0 |
| 选择器失效(小改动) | 4% | 1-2次 | ~¥0.01 | ~¥0.5 |
| 平台大幅改版 | 1% | 5-10次 | ~¥0.05 | ~¥0.5 |
| **合计** | | | | **≈ ¥1/月** |

即使每天发 100 篇文章，AI 韧性层的 LLM 调用成本也低于 ¥5/月。

---

## 六、工作分解

| 阶段 | 内容 | 估算工期 | 依赖 |
|------|------|---------|------|
| Phase 1 | `BrowserEngine` + `SelectorEngine` + Cookie持久化 | 2天 | Playwright 安装 |
| Phase 2 | 知乎发布器 + 选择器配置文件 | 3天 | Phase 1 |
| Phase 3 | `AIResilienceLayer` + 视觉LLM集成 | 2天 | LLMClient |
| Phase 4 | 微博/抖音发布器 | 3天 | Phase 1 |
| Phase 5 | 集成测试 + 错误恢复 + 日志 | 2天 | Phase 2-4 |
| **合计** | | **12天** | |

---

## 七、Playwright 与 Selenium 详细对比（针对本场景）

### 反检测能力

| 维度 | Selenium (AIMedia) | Playwright (本项目) |
|------|-------------------|-------------------|
| 自动化标记 | `execute_cdp_cmd` 手动清除 | `channel: "chrome"` + `--disable-blink-features=AutomationControlled` |
| navigator.webdriver | 手动 JS 注入清除 | 内置清除 ✅ |
| 指纹一致性 | 靠外部库 | `stealth` 插件覆盖 |
| WebDriver 检测 | ChromeDriver 易被识别 | Playwright 更难检测 ✅ |

### 选择器能力

| Selenium | Playwright |
|----------|------------|
| `By.ID`, `By.CLASS_NAME`, `By.XPATH` | `page.locator()` 统一接口 |
| `By.CSS_SELECTOR` | CSS + text= + role= + alt= + label= |
| 不支持 | `has:has-text()` ✅ 文本匹配 |
| 不支持 | `has:not()` ✅ 排除匹配 |

### Async 能力

```python
# Selenium (同步阻塞)
driver.get(url)
element = WebDriverWait(driver, 10).until(
    EC.presence_of_element_located((By.XPATH, xpath))
)
element.click()

# Playwright (原生 async)
await page.goto(url)
await page.locator(selector).wait_for(timeout=10000)
await page.locator(selector).click()

# 优势: Playwright 可并行发布多平台！
async with asyncio.TaskGroup() as tg:
    tg.create_task(publish_zhihu())
    tg.create_task(publish_weibo())
    tg.create_task(publish_douyin())
```

---

## 八、结论

| 方案 | 维护成本 | 稳定性 | 速度 | AI成本 | 推荐 |
|------|---------|--------|------|--------|------|
| Selenium 硬编码 | 高 (选择器常崩) | 低 | 快 | ¥0 | ❌ |
| Playwright 硬编码 | 中 (比Selenium好点) | 中 | 快 | ¥0 | ⚠️ |
| **Playwright + AI韧性层** | **低 (AI自动修复)** | **高** | **快(正常)/慢(异常时)** | **~¥1/月** | **✅ 强烈推荐** |
| Browser Use | 低 (描述任务即可) | 中 (LLM可能抽风) | 慢 (每步1-3s) | ¥100+/月 | ❌ 本场景不合适 |
| Playwright + AI韧性层 | 低 | 高 | 快+稳 | ~¥1/月 | ✅ |

---

*本文档由 QClaw CEO 编制，2026-06-06*
