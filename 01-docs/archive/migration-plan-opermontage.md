# OpenMontage → Multi-Publish 迁移计划

> **版本**: v1.0  
> **日期**: 2026-07-03  
> **总工期预估**: 10-12 周（分为 5 个 Phase）  
> **前置条件**: 已阅读 `01-docs/PRD-video-creation.md` 了解完整产品范围  

---

## 现状总结

| 维度 | 状态 |
|------|------|
| Remotion 前端组件 | ✅ **100% 已移植**（13 个 Composition + 15+ 场景组件） |
| `render-engine.js` | ⚠️ **30%** — 只支持 Explainer，硬编码参数 |
| `CreateView.vue` | ⚠️ **20%** — 只有文字+图片轮播，缺参数 |
| Python 工具链（70+ 模块） | ❌ **0%** |
| Pipeline 编排（13 条管线） | ❌ **0%** |
| AI 提供商集成（30+ 家） | ❌ **0%** |
| 素材检索系统（15 源） | ❌ **0%** |

---

## 阶段路线图

```
Phase 1 (2 周) ─── Phase 2 (2 周) ─── Phase 3 (3 周) ─── Phase 4 (3 周) ─── Phase 5 (2 周)
   基础渲染          多模式扩展          Python 工具链        Pipeline 编排        增强完善
                     
    P0               P1                 P1                   P2                  P2
```

---

## Phase 1：基础渲染完善（P0 — 2 周）

### 目标
把已有的 Remotion 前端和 Electron 渲染引擎完整利用起来，实现"文字/图片→配置参数→渲染→预览→发布"闭环。

### 任务分解

#### 1.1 增强 `render-engine.js`（2 天）

**现状**: 只支持 `Explainer` composition，参数全量传递给渲染进程

**改动**:
- 增加 `composition` 参数支持（Explainer / CinematicRenderer / TalkingHead / TitledVideo / CollageBurst / LyricOverlay）
- 增加 `compositionArgs` 参数，根据 composition 类型传入不同 Props
- 增加 `renderMode: "video" | "still"` 支持
- 增加 `outputFormat: "mp4" | "webm" | "gif"`

```javascript
// 改动后的 render() 签名
render({
  composition: 'Explainer',        // 新增
  props: { cuts, overlays, ... },  // 原有
  profile: 'tiktok',               // 原有
  outputFormat: 'mp4',             // 新增
  compositionArgs: { ... },        // 新增: 各 Composition 的额外参数
})
```

**相关文件**: `apps/desktop/electron/render-engine.js`

#### 1.2 增强 `ipc-handlers/render.js`（1 天）

**现状**: 只透传 props 和 profile

**改动**:
- IPC 协议扩展：`render:start` 支持 `composition`、`compositionArgs`、`outputFormat` 字段
- IPC 新增：`render:list-compositions` 返回可用 Composition 列表
- IPC 新增：`render:get-composition-props` 返回指定 Composition 的默认 Props Schema

**相关文件**: `apps/desktop/electron/ipc-handlers/render.js`

#### 1.3 重构 `CreateView.vue`（4 天）

**现状**: 简陋的文字/图片输入，场景时长硬编码，无 overlays/captions/audio 支持

**改动**:
- 重构为模块化表单（参考下方架构）
- 支持全部 4 个主题
- 场景时长可调
- 支持 overlays、captions、audio 配置

**新组件结构**:

```
CreateView.vue
  ├── ModeSelector.vue          # 文字 / 图片 / 高级 模式切换
  ├── TextInput.vue             # 多行文本输入 + AI 写作
  ├── ImageUpload.vue           # 拖拽上传 + 排序
  ├── SceneEditor.vue           # 场景列表编辑（时长、类型、素材）
  │     └── SceneCard.vue       # 单个场景卡片（类型选择 + 参数编辑）
  ├── OverlayEditor.vue         # 叠加层配置
  ├── CaptionEditor.vue         # 字幕开关 + 样式
  ├── AudioEditor.vue           # 旁白 + 背景音乐
  ├── ThemePicker.vue           # 4 主题选择 + 预览
  ├── ProfileSelector.vue       # 12 平台预设
  └── ProgressPanel.vue         # 渲染进度 + 取消
```

**数据流**:

```javascript
// create 页面的核心状态
const videoConfig = reactive({
  mode: 'text',                    // text | gallery | advanced
  composition: 'Explainer',        // Explainer | CinematicRenderer | TalkingHead ...
  cuts: [{ id, type, text, source, in_seconds, out_seconds, animation, chartData }],
  overlays: [{ type, text, subtitle, in_seconds, out_seconds, position, accentColor }],
  captions: { enabled, wordsPerPage: 6, fontSize: 42, highlightColor, backgroundColor },
  audio: {
    narration: { src, volume },
    music: { src, volume, offsetSeconds, fadeInSeconds, fadeOutSeconds, loop },
  },
  theme: 'clean-professional',
  profile: 'tiktok',
  compositionArgs: {},  // 各 composition 的独有参数
})
```

**相关文件**: `apps/desktop/src/views/CreateView.vue` + 新建 12 个组件

#### 1.4 渲染队列集成（1 天）

**现状**: 渲染直接执行，不经过 TaskQueue

**改动**:
- 复用 `packages/shared-utils/src/task-queue.js`
- 渲染任务入队（maxConcurrent=1）
- 进度事件通过 IPC 推送

```javascript
// 集成点
const taskQueue = new TaskQueue({ maxConcurrent: 1 });

taskQueue.add({
  type: 'remotion_render',
  executor: async (task) => {
    return await renderEngine.render(task.data);
  },
  data: videoConfig,
  timeout: 600000,
});
```

**相关文件**: `apps/desktop/electron/main.js`（注入 TaskQueue）

#### 1.5 结果页面（1 天）

**现状**: 简单 banner

**改动**:
- 新增 `ResultView.vue`（视频播放器 + 下载 + 发布入口）
- 视频播放使用 `<video>` 标签
- 发布入口调用现有发布流程（`publishWechat` / `publishBatch` 等）

**相关文件**: `apps/desktop/src/views/ResultView.vue`

### Phase 1 交付物清单

| 文件 | 状态 |
|------|------|
| `apps/desktop/electron/render-engine.js` | 🔄 增强 |
| `apps/desktop/electron/ipc-handlers/render.js` | 🔄 增强 |
| `apps/desktop/src/views/CreateView.vue` | 🔄 重构 |
| `apps/desktop/src/components/ModeSelector.vue` | ✨ 新建 |
| `apps/desktop/src/components/SceneEditor.vue` | ✨ 新建 |
| `apps/desktop/src/components/SceneCard.vue` | ✨ 新建 |
| `apps/desktop/src/components/OverlayEditor.vue` | ✨ 新建 |
| `apps/desktop/src/components/CaptionEditor.vue` | ✨ 新建 |
| `apps/desktop/src/components/AudioEditor.vue` | ✨ 新建 |
| `apps/desktop/src/components/ThemePicker.vue` | ✨ 新建 |
| `apps/desktop/src/components/ProfileSelector.vue` | ✨ 新建 |
| `apps/desktop/src/components/ProgressPanel.vue` | ✨ 新建 |
| `apps/desktop/src/views/ResultView.vue` | ✨ 新建 |
| `apps/desktop/src/router/index.js` | 🔄 路由注册 |

---

## Phase 2：多模式扩展（P1 — 2 周）

### 目标
将 Remotion 的全部 Composition 类型暴露给用户，支持 TalkingHead、CinematicRenderer、CollageBurst、LyricOverlay、TitledVideo 等模式。

### 任务分解

#### 2.1 ModeSelector 扩展（2 天）

在 Phase 1 的基础上，增加模式选择器支持以下所有模式：

| Composition ID | UI 模式名 | 主要参数 |
|---------------|----------|---------|
| Explainer | 解释视频 | cuts + overlays + captions + audio |
| CinematicRenderer | 电影感短片 | scenes (视频场景 + 标题卡片) + soundtrack + music |
| TalkingHead | 说话头像 | videoSrc + captions + overlays |
| TitledVideo | 标题叠加 | videoSrc + tagline + 时间参数 |
| CollageBurst | 拼贴爆破 | clips + background + curtain |
| LyricOverlay | 歌词同步 | videoSrc + lyrics (时间轴) |
| HeroTitle | 大标题 | title + subtitle |
| ProductReveal | 产品展示 | productImage + name + price |
| EndTag | 结束标签 | text + palette + timing |

#### 2.2 场景组件自动发现（1 天）

**现状**: 需要手动添加每个场景类型

**改动**: 从 `Root.tsx` 中读取 Composition 注册表，自动生成 UI 选择列表

#### 2.3 TalkingHead 模式（2 天）

- 文件上传组件（视频 + 可选字幕文件）
- 字幕生成（调用 Python 后端的 transcriber）
- 叠加层配置
- 渲染调用 `TalkingHead` composition

#### 2.4 CinematicRenderer 模式（2 天）

- 场景列表（视频场景 + 标题卡片混合）
- 色调选择（steel / void / neutral / cold）
- 音乐配置（soundtrack + music 双轨）
- 信号纹理参数配置

#### 2.5 CollageBurst + LyricOverlay 模式（2 天）

- CollageBurst：多视频片段上传 + curtain 参数 + 顺序排列
- LyricOverlay：歌词文本 + 时间轴编辑器

### Phase 2 交付物

| 文件 | 状态 |
|------|------|
| `apps/desktop/src/components/ModeSelector.vue` | 🔄 扩展 |
| `apps/desktop/src/components/TalkingHeadEditor.vue` | ✨ 新建 |
| `apps/desktop/src/components/CinematicEditor.vue` | ✨ 新建 |
| `apps/desktop/src/components/CollageEditor.vue` | ✨ 新建 |
| `apps/desktop/src/components/LyricEditor.vue` | ✨ 新建 |
| `apps/desktop/electron/render-engine.js` | 🔄 支持全部 Composition |

---

## Phase 3：Python 工具链（P1 — 3 周）

### 目标
将 OpenMontage 的核心 Python 后端工具引入 Multi-Publish，实现 AI 视频生成、图像生成、TTS、音乐生成、视频分析等能力。

### 架构设计

```
Electron Main Process
    │
    ├── render-engine.js（Remotion 渲染）← 已有的
    │
    └── python-bridge.js（复用已有模式）
         │
         └── Python 子进程（openmontage-worker）
              │
              ├── tools/video/           # AI 视频生成（15 提供商）
              ├── tools/graphics/        # AI 图像生成（14 提供商）
              ├── tools/audio/           # TTS + 音乐生成
              ├── tools/analysis/        # 视频分析
              ├── tools/enhancement/     # 视频增强
              └── tools/capture/         # 屏幕录制
```

### 任务分解

#### 3.1 Python 子进程管理（2 天）

**现状**: `python-bridge.js` 已存在（用于已有 Python 后端通信），但未对接 OpenMontage

**改动**:
- 新增 `openmontage-bridge.js`，管理 OpenMontage Python 工具进程
- 支持长驻进程模式（避免反复启动 Python）
- IPC 协议定义

```javascript
// 新增 IPC handler
ipcMain.handle('om:generate-video', async (event, { provider, prompt, params }) => {
  return await openmontageBridge.call('generate_video', { provider, prompt, params });
});

ipcMain.handle('om:generate-image', async (event, { provider, prompt, params }) => {
  return await openmontageBridge.call('generate_image', { provider, prompt, params });
});

ipcMain.handle('om:tts', async (event, { provider, text, voice }) => {
  return await openmontageBridge.call('tts', { provider, text, voice });
});

ipcMain.handle('om:transcribe', async (event, { videoPath }) => {
  return await openmontageBridge.call('transcribe', { videoPath });
});
```

**相关文件**: `apps/desktop/electron/openmontage-bridge.js` ✨ 新建

#### 3.2 引入 OpenMontage Python 包（2 天）

**策略**: 不复制代码，而是将 OpenMontage 作为依赖引用

**方案 A**（推荐）: 使用 `git submodule` 或 `pip install -e` 方式引入

```bash
# 方案 A-1: git submodule
git submodule add https://github.com/your-org/OpenMontage.git packages/openmontage-core

# 方案 A-2: pip editable install
pip install -e D:/Projects/OpenMontage
```

**方案 B**（备选）: 复制关键工具模块到 `packages/` 下

```
packages/
  ├── python-backend/          # 已有
  └── openmontage-core/        # ✨ 新建 - OpenMontage 工具子集
        ├── tools/
        ├── lib/
        ├── schemas/
        └── requirements.txt
```

#### 3.3 核心工具适配（8 天）

按优先级适配 OpenMontage 工具：

| 优先级 | 工具 | 用途 | 工时 |
|--------|------|------|------|
| P1 | `tools/video/hunyuan_video.py` | AI 视频（免费/中文友好） | 1d |
| P1 | `tools/video/kling_video.py` | AI 视频 | 1d |
| P1 | `tools/audio/openai_tts.py` | 语音合成 | 0.5d |
| P1 | `tools/audio/elevenlabs_tts.py` | 语音合成（高质量） | 0.5d |
| P1 | `tools/audio/audio_mixer.py` | 音频混合 | 0.5d |
| P1 | `tools/graphics/flux_image.py` | AI 图像生成 | 0.5d |
| P1 | `tools/analysis/transcriber.py` | 语音转文字 | 1d |
| P1 | `tools/analysis/scene_detect.py` | 场景检测 | 0.5d |
| P2 | `tools/video/runway_video.py` | AI 视频 | 0.5d |
| P2 | `tools/video/veo_video.py` | AI 视频 | 0.5d |
| P2 | `tools/audio/suno_music.py` | AI 音乐 | 0.5d |
| P2 | `tools/analysis/video_analyzer.py` | 视频分析 | 0.5d |

#### 3.4 环境配置与懒加载（2 天）

- 首次使用 Python 工具时检查环境
- 缺少依赖时提示安装
- 检测 `.env` 中的 API Key
- API Key 配置页面（复用现有 Provider 管理）

**相关文件**:
- `apps/desktop/src/views/Providers.vue` 🔄 扩展（增加 AI 服务商管理）
- `config/config.yaml` 🔄 扩展（增加 AI 提供商配置）

### Phase 3 交付物

| 文件 | 状态 |
|------|------|
| `apps/desktop/electron/openmontage-bridge.js` | ✨ 新建 |
| `packages/openmontage-core/` | ✨ 新建（submodule 或子集）|
| `apps/desktop/src/views/Providers.vue` | 🔄 扩展 |

---

## Phase 4：Pipeline 编排（P2 — 3 周）

### 目标
引入 OpenMontage 的 Pipeline 编排系统，让 AI 能自动执行"研究→提案→脚本→素材→编辑→合成→发布"完整流程。

### 任务分解

#### 4.1 Pipeline 定义系统（3 天）

**改动**:
- 引入 YAML 驱动的 Pipeline 定义（从 OpenMontage 的 `pipeline_defs/`）
- 选择 4 条核心管线优先适配

```yaml
# 简化版 pipeline 定义示例
name: quick-video
stages:
  - name: script
    description: 生成脚本
    tools: [llm]
  - name: assets
    description: 生成素材（图像 + 语音）
    tools: [image_gen, tts]
  - name: compose
    description: 合成视频
    tools: [remotion_render]
  - name: publish
    description: 发布到平台
    tools: [multi_publish]
```

#### 4.2 检查点协议（2 天）

- 每个阶段完成后保存检查点
- 支持从中断处恢复

#### 4.3 预算管理（2 天）

- AI 工具调用成本跟踪
- 每个管线预算上限
- 用户确认后才调用付费 API

#### 4.4 Delivery Promise 分类器（1 天）

**现状**: 所有视频都用 Remotion Explainer

**改动**: 根据用户输入自动推荐最佳 Pipeline

| 输入类型 | 推荐 Pipeline |
|----------|-------------|
| 纯文字 | `animated-explainer` |
| 素材视频 + 文字描述 | `cinematic` |
| 讲话视频 | `talking-head` |
| 图片集合 | `hybrid` |
| 播客音频 | `podcast-repurpose` |
| 屏幕操作 | `screen-demo` |

#### 4.5 素材检索集成（3 天）

- 集成 5 个优先素材源（Pexels / Pixabay / Coverr / Mixkit / Unsplash）
- 搜索→预览→选择→下载流程
- CLIP 语义检索（可选）

### Phase 4 交付物

| 文件 | 状态 |
|------|------|
| `packages/pipeline-engine/` | ✨ 新建 |
| `packages/pipeline-engine/pipeline_defs/` | ✨ 新建（4 条管线）|
| `packages/pipeline-engine/checkpoint.py` | ✨ 新建 |
| `packages/pipeline-engine/budget.py` | ✨ 新建 |
| `packages/stock-sources/` | ✨ 新建 |

---

## Phase 5：增强与完善（P2 — 2 周）

### 目标
补齐视频增强能力和边缘场景。

### 任务分解

#### 5.1 视频增强工具（3 天）

- 人脸增强（`face_enhance.py`）
- 背景移除（`bg_remove.py`）
- 视频上采样（`upscale.py`）
- 色彩校正（`color_grade.py`）
- 静音剪切（`silence_cutter.py`）

#### 5.2 自动裁切（2 天）

- 人脸跟踪自动裁切（`auto_reframe.py`）
- 横版→竖版自动转换
- 支持 FaceTracker（MediaPipe）

#### 5.3 屏幕录制模式（2 天）

- `screen_recorder.py` + `cap_recorder.py` 适配
- Remotion TerminalScene 合成终端动画模式
- 录制→修剪→标注流程

#### 5.4 自定义 Playbook 生成（2 天）

- `playbook_generator.py` 适配
- 用户自定义颜色/字体/动画参数
- 保存和复用自定义主题

#### 5.5 全面测试（3 天）

- 渲染引擎测试（覆盖率 > 80%）
- 各 Composition 场景组件测试
- Python 工具适配测试
- 端到端流程测试

### Phase 5 交付物

| 文件 | 状态 |
|------|------|
| `packages/om-enhance/` | ✨ 新建 |
| `packages/om-capture/` | ✨ 新建 |
| `apps/desktop/src/components/CustomThemeEditor.vue` | ✨ 新建 |
| `apps/desktop/src/components/ScreenRecorder.vue` | ✨ 新建 |
| `tests/` | 🔄 新增 |

---

## 依赖关系总图

```
Phase 1 ──── 无外部依赖，可直接开始
   │
   ▼
Phase 2 ──── 依赖 Phase 1 的组件架构
   │
   ▼
Phase 3 ──── 依赖 Phase 1（渲染集成）+ Python 环境
   │
   ├── Phase 4 ──── 依赖 Phase 3（工具链完整）
   │
   └── Phase 5 ──── 依赖 Phase 3（工具链完整）
                  + Phase 4（部分编排能力）
```

---

## 工时汇总

| Phase | 内容 | 工时 | 并行度 |
|-------|------|------|--------|
| Phase 1 | 基础渲染完善 | 9 天 | 低（串行） |
| Phase 2 | 多模式扩展 | 9 天 | 中（组件并行） |
| Phase 3 | Python 工具链 | 14 天 | 中（工具并行适配） |
| Phase 4 | Pipeline 编排 | 11 天 | 低（依赖 Phase 3） |
| Phase 5 | 增强完善 | 12 天 | 中（工具并行） |
| **合计** | | **~55 天** | **10-12 周** |

---

## 技术债务与注意事项

### 现有的好基础（可沿用）
- ✅ `TaskQueue` — 渲染队列直接用
- ✅ `python-bridge.js` — Python 子进程管理复用
- ✅ `preload.js` — IPC 桥接模式复用
- ✅ `vite.config.js` — 构建配置
- ✅ `package.json` — 依赖管理

### 需要处理的兼容问题
- ⚠️ `render-engine.js` 的 `-crf` 参数：OpenMontage 用 `libx264` + `crf=23`，Multi-Publish 目前无 CRF 控制
- ⚠️ OpenMontage 依赖 Python ≥3.10，Multi-Publish 当前 Python 版本需确认
- ⚠️ OpenMontage 的 `.env` API Key 管理与 Multi-Publish 的 `credential-store.js` 需要统一
- ⚠️ Remotion 版本锁定（OpenMontage 用 `^4.0.484`，Multi-Publish 需保持一致）

### 建议的代码组织

```
packages/
  ├── rpa-engine/              # 已有：RPA 发布引擎
  ├── shared-utils/            # 已有：共享工具
  ├── remotion-composer/       # 已有：Remotion 渲染组件
  ├── python-backend/          # 已有：Python 发布后端
  └── openmontage-core/        # ✨ 新增：OpenMontage 工具桥接
        ├── bridge/            # IPC 通信层
        ├── providers/         # AI 提供商轻封装
        ├── requirements.txt   # Python 依赖
        └── README.md

apps/
  └── desktop/
        ├── electron/
        │   ├── render-engine.js           # 🔄 增强
        │   ├── openmontage-bridge.js      # ✨ 新增
        │   └── ipc-handlers/
        │       └── render.js              # 🔄 增强
        └── src/
            ├── components/
            │   └── (15+ 新组件)            # ✨ 新增
            └── views/
                ├── CreateView.vue          # 🔄 重构
                └── ResultView.vue          # ✨ 新增
```

---

## 快速开始（Phase 1 第一个任务）

### 第 1 步：增强 `render-engine.js`

```javascript
// 当前：只渲染 Explainer
// 改为：支持动态 composition 选择

render(props, options = {}) {
  const {
    composition = 'Explainer',  // 新增参数
    ...
  } = options;

  const cmd = ['npx', 'remotion', 'render', 'src/index.tsx',
    composition,                    // 使用 composition 参数
    outputPath,
    `--props=${propsPath}`
  ];
  ...
}
```

### 第 2 步：分段验证

```bash
# 测试 CinematicRenderer
npx remotion render src/index.tsx CinematicRenderer out/cinematic.mp4

# 测试 TalkingHead
npx remotion render src/index.tsx TalkingHead out/talking.mp4

# 测试 CollageBurst
npx remotion render src/index.tsx CollageBurst out/collage.mp4
```

> **下一阶段**: 完成 Phase 1 后，建议从 Phase 3 开始并行推进，因为 Python 工具链的独立性强，不依赖前端的完成状态。
