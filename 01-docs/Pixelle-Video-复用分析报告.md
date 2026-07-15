# Pixelle-Video 可复用代码与技术分析报告

> 分析时间：2026-07-16
> 源项目：https://github.com/ATH-MaaS/Pixelle-Video（Apache 2.0 许可证）
> 目标项目：Multi-Publish

---

## 项目概览

| 维度 | Pixelle-Video | Multi-Publish |
|------|--------------|---------------|
| **定位** | AI 全自动短视频生成引擎 | 多平台内容一键发布（含视频创作） |
| **语言** | Python 3.11+ | Node.js + Python 3.10+ |
| **架构** | 单体 Python 包 + FastAPI | Monorepo (Electron + 多语言) |
| **核心能力** | 文案→配图→语音→视频 全自动 | RPA/API 发布 + AI 写作 + 视频创作 |
| **视频创作** | pipeline 模式 + ffmpeg-python | OpenMontage 集成 (14 种模板) |
| **许可证** | Apache 2.0 | 私有项目 |

---

## 可复用的核心代码模块

### 1. LLM 结构化输出服务 — 高价值，可直接迁移

**源文件：** [pixelle_video/services/llm_service.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/services/llm_service.py)

Pixelle-Video 的 `LLMService` 基于 OpenAI SDK 实现，最大亮点是支持 **Pydantic 结构化输出**（`response_type` 参数）。这个设计比 Multi-Publish 当前的 `ai-writer` 包（仅支持纯文本输出）更先进。

核心功能：
- 通过 `response_type` 参数直接传入 Pydantic 模型，LLM 自动返回结构化 JSON
- 支持 JSON Schema 指令注入（兼容所有 OpenAI 兼容提供商：Qwen/DeepSeek/Ollama 等）
- 内置三重解析回退：直接 JSON → Markdown 代码块 → 大括号提取
- 支持运行时参数覆盖（api_key / base_url / model 可单独覆盖）

```python
# Pixelle 的做法 - 自动解析 LLM 输出为结构化数据
class Narration(BaseModel):
    text: str
    duration: float
    image_prompt: str

narration = await llm("写一段视频文案", response_type=Narration)
print(narration.text)  # 直接访问结构化字段
```

**复用路径：**
- 移植到 `packages/python-backend/src/multi_publish/services/llm_service.py`
- 替换/增强现有的 `ai-writer` 包
- 对 Multi-Publish 的发布内容格式化（标题/摘要/标签等结构化输出）极为有用

---

### 2. Prompt 管理体系 — 中等价值，可参考

**源文件：** [pixelle_video/prompts/](https://github.com/ATH-MaaS/Pixelle-Video/tree/main/pixelle_video/prompts)

Pixelle 将每个领域的 prompt 拆分为独立 Python 文件，每个文件包含完整的 system prompt + JSON schema：

| 文件 | 用途 |
|------|------|
| [content_narration.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/prompts/content_narration.py) | 视频解说词生成 |
| [image_generation.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/prompts/image_generation.py) | 图像生成 prompt |
| [title_generation.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/prompts/title_generation.py) | 标题生成 |
| [topic_narration.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/prompts/topic_narration.py) | 主题式解说词（9.6KB，最复杂的一个） |
| [video_generation.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/prompts/video_generation.py) | 视频生成 prompt |
| [asset_script_generation.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/prompts/asset_script_generation.py) | 素材脚本生成 |
| [style_conversion.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/prompts/style_conversion.py) | 风格转换 |

**优点：**
- 每个 prompt 文件是自包含的（system + user prompt + JSON schema）
- 方便版本管理和国际化
- LLM 调用时只需传入 prompt 函数名和参数

**复用建议：**
- Multi-Publish 的 `ai-writer` 中 prompt 写在代码里，可以采纳这种模式
- 将各平台的发布内容优化 prompt（标题/摘要/标签生成）拆分为独立文件
- 便于维护、测试和国际化

---

### 3. LLM Presets 配置 — 低价值但实用

**源文件：** [pixelle_video/llm_presets.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/llm_presets.py)

内置了 6 个主流 LLM 提供商的预设配置：

| 提供商 | base_url | 默认模型 |
|--------|----------|----------|
| Qwen | dashscope.aliyuncs.com | qwen-max |
| OpenAI | api.openai.com | gpt-4o |
| Claude | api.anthropic.com | claude-sonnet-4-5 |
| DeepSeek | api.deepseek.com | deepseek-chat |
| Ollama | localhost:11434/v1 | llama3.2 |
| Moonshot | api.moonshot.cn | moonshot-v1-8k |

每个预设包含 `name` / `base_url` / `model` / `api_key_url`（获取密钥的链接），Ollama 还包含 `default_api_key` 用于兼容。

**复用方式：**
- Multi-Publish 的 `ai-writer-api` 可以复用此预设表
- 作为前端 LLM 提供商选择下拉菜单的数据源
- 用户首次配置时直接选择预设，无需手动填写 base_url

---

### 4. TTS 语音配置管理 — 低价值

**源文件：** [pixelle_video/tts_voices.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/tts_voices.py)

Edge TTS 的多语言语音预设数据库，包含 20+ 种语音：

| 语言 | 语音数 | 示例 |
|------|--------|------|
| zh-CN | 8 | Xiaoxiao(女) / Yunjian(男) / Yunxi(男) |
| en-US | 4 | Aria(女) / Guy(男) |
| en-GB | 2 | Sonia(女) / Ryan(男) |
| ko-KR | 2 | InJoon(男) / SunHi(女) |
| 法/葡/德/俄/土/西 | 各 2 | 男女各一 |

特点：
- 每个语音带 `id` / `label_key`（i18n 翻译键） / `locale` / `gender` 属性
- 提供 `get_voice_display_name()` 函数支持多语言显示
- 提供 `speed_to_rate()` 函数将速度倍数转为 Edge TTS 的 `+xx%` 格式

**复用方式：**
- Multi-Publish 的视频创作模块 `video_creation/providers/audio/` 已有多种 TTS 提供商
- 可以直接复用此 Edge TTS 语音列表作为参考音频选项

---

### 5. HTML 模板 + Playwright 渲染流水线 — 中等价值

**源文件：**
- [pixelle_video/services/frame_html.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/services/frame_html.py)（17KB）
- [pixelle_video/services/frame_processor.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/services/frame_processor.py)（20KB）
- [templates/](https://github.com/ATH-MaaS/Pixelle-Video/tree/main/templates)（按尺寸分类）

Pixelle 视频生成的核心技术链：**HTML 模板 → Playwright 截图 → ffmpeg 合成视频**

**模板结构：**
```
templates/
├── 1080x1080/       # 方形
│   ├── default.html
│   └── image_default.html
├── 1080x1920/       # 竖屏
│   ├── default.html
│   ├── static_*.html
│   ├── image_*.html
│   └── video_*.html
└── 1920x1080/       # 横屏
    └── ...
```

**模板命名规范：**
- `static_*.html` — 纯文字模板（无需 AI 生成媒体）
- `image_*.html` — 图片模板（使用 AI 生成的图片作为背景）
- `video_*.html` — 视频模板（使用 AI 生成的视频作为背景）

**模板使用 Jinja2 风格变量占位：**
```html
<div class="frame">
  <h1>{{ title }}</h1>
  <p>{{ content }}</p>
  <img src="{{ image_path }}" />
</div>
```

**复用价值：**
- 如果不需要 Remotion 复杂的 React 动画，HTML+Playwright 方案更简单
- 适合快速生成带文字/图片的短视频封面和片段
- 与 Multi-Publish 已有的 Playwright 基础设施兼容

---

### 6. ConfigManager 配置管理 — 参考设计

**源文件：**
- [pixelle_video/config/schema.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/config/schema.py) — Pydantic 模型定义
- [pixelle_video/config/loader.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/config/loader.py) — YAML 读写
- [pixelle_video/config/manager.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/config/manager.py) — 单例管理

三层配置架构：

```
YAML 文件 (config.yaml)       # 持久化
    ↓
Pydantic Schema (Pydantic模型) # 类型安全 + 验证
    ↓
ConfigManager (Singleton)     # 运行时访问 + 热重载 + deep merge
```

核心能力：
- **Pydantic 类型验证**：所有配置字段有类型定义，读取时自动校验
- **热重载**：`reload()` 方法支持运行时重新读取配置
- **Deep merge 更新**：`update(updates)` 支持深层合并（如只改 `llm.api_key` 而不影响其他字段）
- **便捷访问**：`get_llm_config()`、`set_comfyui_config()` 等封装方法

**复用建议：**
- Multi-Publish 的 `config/config.yaml` 目前是纯 YAML 读取
- 可以借鉴 Pydantic schema + 热重载 + deep merge 的模式
- 提升配置管理的类型安全性和运行时可修改能力

---

### 7. Pipeline 架构设计 — 参考

**源文件：** [pixelle_video/pipelines/base.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/pipelines/base.py)

抽象基类定义：

```python
class BasePipeline(ABC):
    def __init__(self, pixelle_video_core):
        self.core = pixelle_video_core  # 访问所有服务
        self.llm = pixelle_video_core.llm
        self.tts = pixelle_video_core.tts
        self.media = pixelle_video_core.media
        self.video = pixelle_video_core.video

    @abstractmethod
    async def __call__(self, text, progress_callback=None, **kwargs):
        # 子类实现具体流程
        pass

    def _report_progress(self, callback, event_type, progress, **kwargs):
        # 统一的进度上报
        pass
```

**注册的 Pipeline 列表：**

| Pipeline | 文件 | 大小 | 用途 |
|----------|------|------|------|
| standard | [standard.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/pipelines/standard.py) | 23.6KB | 标准流程：主题→文案→配图→语音→视频 |
| custom | [custom.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/pipelines/custom.py) | 22.6KB | 自定义文案（跳过 AI 写稿） |
| asset_based | [asset_based.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/pipelines/asset_based.py) | 41.3KB | 素材驱动（用户上传图片/视频作为素材） |
| linear | [linear.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/pipelines/linear.py) | 5.4KB | 线性流程（简化版） |

**对比 Multi-Publish：**
- Multi-Publish 的 `video_creation/pipeline/` 已有 14 种 YAML 模板流水线
- Pixelle 的设计更简洁（纯 Python class + progress_callback）
- 可以作为新增快速流水线的参考

---

### 8. FastAPI 异步任务管理器 — 中等价值

**源文件：** [api/tasks/manager.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/api/tasks/manager.py)

TaskManager 核心能力：

```
任务状态机：
    pending → running → completed
                       → failed
                       → cancelled (仅限 pending/running → cancelled)
```

特性：
- **同类型任务互斥**：`cancel_previous` 参数，新任务自动取消同一类型的旧任务
- **并发限制**：`max_concurrent` 参数控制同时运行的任务数
- **任务取消**：支持取消 pending 和 running 状态的任务
- **生命周期管理**：`start()` / `stop()` 用于应用启动/关闭

```python
task_manager = TaskManager(max_concurrent=3)

# 创建任务（自动取消同类型旧任务）
task = await task_manager.create_task(
    task_type="video_generation",
    coro=generate_video(text),
    cancel_previous=True,
    metadata={"text": text}
)

# 查询任务状态
status = await task_manager.get_task_status(task.id)
# {"status": "running", "progress": 0.5, ...}

# 取消任务
await task_manager.cancel_task(task.id)

# 清理已完成任务
await task_manager.cleanup_completed(max_age_hours=24)
```

**复用建议：**
- Multi-Publish 的 `core/task_queue.py` 已有任务队列
- 可以引入状态机管理和互斥机制
- 增强任务取消和生命周期管理

---

### 9. FastAPI Router 模块化组织 — 低价值

**源文件：** [api/routers/](https://github.com/ATH-MaaS/Pixelle-Video/tree/main/api/routers)

按资源拆分的 10 个 Router：

| Router | 端点 |
|--------|------|
| health.py | `/health` |
| llm.py | `/api/llm/chat` |
| tts.py | `/api/tts/synthesize`、`/api/tts/voices` |
| image.py | `/api/image/generate` |
| content.py | `/api/content/narration`、`/api/content/title` |
| video.py | `/api/video/generate/sync`、`/api/video/generate/async` |
| tasks.py | `/api/tasks/{id}` |
| files.py | `/api/files/upload`、`/api/files/download` |
| resources.py | `/api/resources/workflows`、`/api/resources/templates` |
| frame.py | `/api/frame/render` |

每个 router 的典型结构：
```python
from fastapi import APIRouter, Depends
from api.dependencies import get_pixelle_video

router = APIRouter()

@router.post("/generate")
async def generate(prompt: str, core=Depends(get_pixelle_video)):
    return await core.media(prompt)
```

**复用建议：**
- Multi-Publish 的 FastAPI 应用已模块化
- 可以借鉴 Router 拆分粒度（每个资源一个独立的 router 文件）

---

### 10. 视频合成智能时长调整 — 中等价值

**源文件：** [pixelle_video/services/video.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/services/video.py)（38.7KB）

`VideoService` 的核心能力：

```python
# 智能时长匹配
if auto_adjust_duration:
    diff = video_duration - audio_duration

    if diff < 0:
        # 视频 < 音频 → 冻结最后一帧补齐
        video = self._pad_video_to_duration(video, audio_duration, "freeze")

    elif diff > tolerance:
        # 视频 >> 音频 → 裁剪视频
        video = self._trim_video_to_duration(video, audio_duration)

    else:
        # 视频 ≈ 音频 → 保持原样
        pass
```

其他功能：
- **视频拼接**：支持 `demuxer`（快速无重编码）和 `filter`（兼容不同格式）两种模式
- **音频-视频合并**：支持替换音频 / 混音 / 自动检测音轨是否存在
- **BGM 添加**：支持循环/单次播放，音量控制
- **图片→视频**：`create_video_from_image()` 生成静态帧视频
- **音频流检测**：`has_audio_stream()` 自动检测视频是否包含音轨

**复用价值：**
- Multi-Publish 的视频合成模块可以引入此逻辑
- 解决 TTS 音频与视频片段时长不匹配的问题

---

## 技术实现方案参考

### Pixelle-Video 完整项目结构

```
Pixelle-Video/
├── api/                      # FastAPI 后端
│   ├── app.py                # 应用入口 (uvicorn)
│   ├── config.py             # API 配置
│   ├── dependencies.py       # 依赖注入
│   ├── routers/              # API 路由 (10个)
│   │   ├── health.py / llm.py / tts.py / image.py
│   │   ├── content.py / video.py / tasks.py
│   │   ├── files.py / resources.py / frame.py
│   ├── schemas/              # Pydantic 请求/响应模型
│   └── tasks/                # 异步任务管理
│       ├── manager.py        # TaskManager
│       └── models.py         # 任务数据模型
├── pixelle_video/            # 核心引擎
│   ├── __init__.py           # PixelleVideoCore + 全局实例
│   ├── service.py            # 服务层 (初始化所有服务)
│   ├── llm_presets.py        # LLM 提供商预设
│   ├── tts_voices.py         # Edge TTS 语音库
│   ├── config/               # 配置管理
│   │   ├── schema.py         # Pydantic schema
│   │   ├── loader.py         # YAML 读写
│   │   └── manager.py        # 单例管理 + 热重载
│   ├── models/               # 数据模型 (Progress / Storyboard)
│   ├── services/             # 核心服务
│   │   ├── llm_service.py    # LLM (12KB) — 高复用价值
│   │   ├── tts_service.py    # TTS (12KB)
│   │   ├── media.py          # ComfyUI 媒体生成 (12KB)
│   │   ├── api_media.py      # API 直连媒体 (36KB)
│   │   ├── video.py          # ffmpeg 视频合成 (38KB)
│   │   ├── frame_html.py     # HTML 模板渲染 (17KB)
│   │   ├── frame_processor.py # 分镜管理 (20KB)
│   │   ├── persistence.py    # 结果持久化 (26KB)
│   │   ├── history_manager.py # 历史记录 (6KB)
│   │   ├── image_analysis.py # 图片分析 (8KB)
│   │   ├── video_analysis.py # 视频分析 (8KB)
│   │   └── api_services/     # API 提供商适配层
│   ├── pipelines/            # 视频生成流水线
│   │   ├── base.py           # 抽象基类
│   │   ├── standard.py       # 标准流水线 (23KB)
│   │   ├── custom.py         # 自定义文案 (22KB)
│   │   ├── asset_based.py    # 素材驱动 (41KB)
│   │   └── linear.py         # 线性流程 (5KB)
│   ├── prompts/              # LLM prompt 模板 (7个)
│   └── utils/                # 工具函数
│       ├── llm_util.py       # LLM 工具
│       ├── tts_util.py       # TTS 工具 (14KB)
│       ├── os_util.py        # 路径/文件工具 (14KB)
│       ├── template_util.py  # 模板工具 (16KB)
│       ├── content_generators.py # 内容生成 (17KB)
│       ├── workflow_util.py  # 工作流工具
│       └── prompt_helper.py  # Prompt 辅助
├── web/                      # Streamlit WebUI
│   ├── app.py                # 主入口
│   ├── components/           # UI 组件
│   ├── pages/                # 页面 (Home / History)
│   ├── pipelines/            # Web 端流水线
│   ├── state/                # 状态管理
│   └── utils/                # Web 工具
├── templates/                # HTML 模板 (按尺寸分类)
├── workflows/                # ComfyUI 工作流
│   ├── selfhost/             # 本地 ComfyUI 工作流
│   └── runninghub/           # 云端 RunningHub 工作流
├── bgm/                      # 背景音乐
├── config.example.yaml       # 配置示例
├── pyproject.toml            # 项目配置
└── Dockerfile                # Docker 部署
```

---

## 与 Multi-Publish 现有能力的对比总结

| 能力维度 | Multi-Publish 现状 | Pixelle-Video 可补充 | 复用优先级 |
|----------|-------------------|---------------------|-----------|
| **LLM 结构化输出** | 纯文本，需手动解析 | Pydantic response_type 自动解析 | ⭐⭐⭐ 高 |
| **Prompt 管理** | 内联在代码中 | 独立文件 + JSON schema | ⭐⭐ 中 |
| **LLM Presets** | 无预设列表 | 6 个主流提供商预设 | ⭐ 低 |
| **Edge TTS 语音** | 已有更多 TTS 提供商 | 20+ 语音预设数据库 | 无需复用 |
| **HTML→视频渲染** | 使用 Remotion (React) | Playwright + HTML 模板更轻量 | ⭐⭐ 中 |
| **Pipeline 架构** | YAML 模板流水线 | Python class + callback | ⭐ 参考 |
| **异步任务管理** | 基本任务队列 | 完整状态机 + 互斥 + 取消 | ⭐⭐ 中 |
| **FastAPI 组织** | 已模块化 | 参考 router 拆分模式 | ⭐ 低 |
| **视频时长智能调整** | 需手动处理 | 自动 freeze/trim | ⭐⭐ 中 |
| **Config 管理** | 纯 YAML | Pydantic schema + hot reload | ⭐⭐ 中 |

---

## 最推荐的复用路径

### 路径一：LLM 结构化输出（立即执行，高价值）

将 [llm_service.py](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/services/llm_service.py) 移植到 `packages/python-backend/src/multi_publish/services/`。

**核心收益：**
- 任何 LLM 调用都能获得类型安全的结构化输出
- 发布内容格式化（标题/摘要/标签生成）可以一步到位
- 无需手动编写 JSON 解析逻辑

### 路径二：Prompt 管理重组（短期，中价值）

采纳 Pixelle 的 [prompts 管理方式](https://github.com/ATH-MaaS/Pixelle-Video/tree/main/pixelle_video/prompts)，将各平台的发布内容 prompt 拆分为独立文件。

**核心收益：**
- prompt 可版本管理
- 各平台独立优化，不影响其他平台
- 方便国际化（多语言 prompt）

### 路径三：轻量模板视频方案（中期，中价值）

如果 Multi-Publish 的视频创作需要快速生成带文字的短视频片段，借鉴 Pixelle 的 [HTML 模板 + Playwright 渲染](https://github.com/ATH-MaaS/Pixelle-Video/tree/main/templates) 方案。

**核心收益：**
- 比 Remotion 更轻量，适合快速原型
- 与已有 Playwright 基础设施兼容
- 模板无需编译，可热更新

### 路径四：配置管理增强（短期，中价值）

借鉴 [Pydantic schema + hot reload](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/pixelle_video/config/schema.py) 模式改进 `config/config.yaml`。

**核心收益：**
- 类型安全：配置错误在启动时即可发现
- 热重载：修改配置无需重启应用
- Deep merge：只改需要改的字段

### 路径五：任务状态机增强（中期，参考）

参考 [TaskManager](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/api/tasks/manager.py) 的状态管理和互斥机制。

**核心收益：**
- 同类型任务自动去重
- 标准化的任务取消流程
- 更清晰的任务生命周期管理

---

> **许可证说明：** Pixelle-Video 使用 Apache 2.0 许可证，代码可自由使用、修改、分发，但需保留原始版权声明。详细声明见源项目 [NOTICE](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/NOTICE) 文件。
