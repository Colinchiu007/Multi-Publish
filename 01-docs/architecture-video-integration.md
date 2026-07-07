# OpenMontage 视频集成 — 架构设计方案

> **版本**: v2.0  
> **日期**: 2026-07-08  
> **状态**: 定稿  
> **审查框架**: 质量节拍 Phase 1.1（技术架构）+ Phase 5（审查模式）  
> **相关文档**: PRD-video-creation.md, ADR-001, ADR-002, remotion-integration-design.md, refactoring-review-2026-07-08.md  

---

## 一、背景与真实现状

### 1.1 需要明确的事实

> **OpenMontage 的代码（Python 工具链 + Remotion Composer）已在之前的工作中全部集成完毕。**  
> 这不是"还需要集成"的问题，而是"已经集成但 Electron 主进程没有调用"的问题。

### 1.2 已集成的 Remotion Composer（100% ✅）

| 项目 | 文件数 | 说明 |
|------|--------|------|
| `packages/remotion-composer/src/` | 38 文件 | 比 OpenMontage（35 文件）多 3 个 |

**7 个 Composition 全部已复制：**
Explainer / TalkingHead / CinematicRenderer / CollageBurst / TitledVideo / LyricOverlay

**15+ 场景组件全部已复制：**
TextCard, TerminalScene, AnimeScene, HeroTitle, CaptionOverlay, StatCard, StatReveal, ComparisonCard, CalloutBox, ProductReveal, ScreenshotScene, ParticleOverlay, ProgressBar, ProviderChip, EndTag + 4 种图表

**新增文件（OpenMontage 没有的）：**
- `scene-builder.ts` — 场景输入→Cut 数组转换
- `props-validator.ts` — Composition props 校验
- `media-profiles.ts` — 媒体预设（分辨率/FPS/码率）

### 1.3 已集成的 Python 工具链（100% ✅）

| 路径 | 文件数 | 说明 |
|------|--------|------|
| `packages/python-backend/video_creation/` | 127 个 .py | 比 OpenMontage（121 个）多 6 个 |

**11 大类工具全部已复制：**

| 大类 | 覆盖范围 |
|------|---------|
| AI 视频生成 | Hunyuan / CogVideo / Grok / HeyGen / Kling / Runway / VEO / Wan / Minimax / Seedance / LTX / Higgsfield / HyperFrames |
| AI 图像生成 | Flux / DALL-E / Recraft / Grok / Imagen / ComfyUI / 本地扩散 / Code Snippet / Diagram Gen / Math Animate |
| 音频系统 | 7 种 TTS（豆包/ElevenLabs/Google/OpenAI/Piper 等）+ 3 种音乐（Suno/MusicGen/FreeSound）+ 音频库/选择器 |
| 视频分析 | 场景检测 / 人脸跟踪 / 转写 / 音频分析 / 帧采样 / Composition 验证 / 视频分析 / Visual QA / 视频下载 |
| 视频增强 | 去背景 / 调色 / 眼部增强 / 人脸增强 / 人脸修复 / 上采样 |
| 视频处理 | 绿幕合成/处理 / 自动裁切 / 静音剪切 / 视频修剪 / Clip 搜索/缓存 / 字幕烧录 |
| 字幕系统 | subtitle_gen |
| 人物动画 | 唇形同步 / 说话头像 / 角色动画 |
| 屏幕录制 | 屏幕录制 / 截取选择器 |
| 素材检索 | 15 源（Pexels/Pixabay/NASA/Unsplash/Videvo/Wikimedia 等） |
| Pipeline 管线 | 13 条 YAML 定义 + Python Loader + Schema |

### 1.4 真正缺失的（Electron 主进程服务层 ❌）

| 文件 | 状态 | 作用 |
|------|------|------|
| `apps/desktop/electron/services/render-engine.js` | ⚠️ 存在，需扩展 | 只默认 Explainer，需支持多 Composition |
| `apps/desktop/electron/services/composition-manager.js` | ❌ 不存在 | 管理 7 个 Composition 注册/参数校验 |
| `apps/desktop/electron/services/ai-generator.js` | ❌ 不存在 | 桥接 60+ Python AI 工具 |
| `apps/desktop/electron/services/video-engine.js` | ❌ 不存在 | 桥接视频处理/分析/增强工具 |
| `apps/desktop/electron/services/pipeline-engine.js` | ❌ 不存在 | 13 条管线编排 |
| `apps/desktop/electron/ipc-handlers/ai.js` | ❌ 不存在 | ai:* IPC 端点 |
| `apps/desktop/electron/ipc-handlers/video.js` | ❌ 不存在 | video:* IPC 端点 |
| `apps/desktop/electron/ipc-handlers/pipeline.js` | ❌ 不存在 | pipeline:* IPC 端点 |
| Vue UI（CreateView.vue + 创作页等） | ❌ 不存在 | 用户视频创作用户界面 |

---

## 二、架构原则

### 2.1 核心决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 集成策略 | **文件已复制，只需建桥接层** | 代码已在项目中，不需要再复制 |
| Python 调用 | **复用 python-bridge.js** | 已有稳定的 Electron→Python 通信链路 |
| Composition 管理 | **新增 composition-manager.js** | 集中管理 7 个 Composition，统一 props 生成 |
| 新服务注册 | **走 container.setup.js** | 遵循 ADR-002，全部通过 DI 容器获取 |
| UI 框架 | **Vue 3 + 现有路由** | 复用项目已有的 Vue 3 技术栈 |
| 启用策略 | **默认禁用** | 不干扰现有发布流程 |

### 2.2 架构层次（基于 ADR-002）

```
Layer 4 (Entry):  main.js / preload.js
     │
Layer 3 (IPC):    ipc-handlers/
     │              ├── render.js   (已有, 扩展 composition 管理)
     │              ├── ai.js       (🆕 新增)
     │              ├── video.js    (🆕 新增)
     │              └── pipeline.js (🆕 新增)
     │
Layer 2 (Service): services/
     │              ├── render-engine.js       (已有, 扩展多 Composition)
     │              ├── composition-manager.js (🆕 新增)
     │              ├── ai-generator.js        (🆕 新增)
     │              ├── video-engine.js        (🆕 新增)
     │              └── pipeline-engine.js     (🆕 新增)
     │
Layer 1 (Core):    core/
                    ├── container.js            (已有)
                    ├── error-codes.js          (已有)
                    └── container.setup.js      (已有)
```

### 2.3 数据流

```
Vue 创作页 (用户选择 Composition + 填参数)
    │ IPC (preload.js)
    ▼
ipc-handlers/ai.js / video.js / pipeline.js
    │ DI → Service
    ▼
ai-generator.js / video-engine.js / pipeline-engine.js
    │ python-bridge.js (子进程)
    ▼
Python tools (已存在)
    │
    ├── 视频生成 → 输出文件路径
    ├── 音频生成 → 输出文件路径
    ├── 分析/增强 → 结构化数据
    └── 管线编排 → 检查点 + 进度

Vue 发布页 (发布已渲染视频 → 复用现有发布器)
```

---

## 三、3 阶段实施计划

### Phase 1（P0）— Composition 管理（2 周）

**目标**: 让 Electron 主进程能调用全部 7 个 Composition

#### 新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `services/composition-manager.js` | 🆕 新增 | registerCompositions / listCompositions / getComposition / buildRenderProps / validateProps |
| `services/render-engine.js` | 🛠 扩展 | COMPOSITIONS 常量更新，composition 参数处理 |
| `ipc-handlers/render.js` | 🛠 扩展 | 新增 render:list-compositions / render:get-composition |
| `packages/remotion-composer/src/Root.tsx` | ✅ 已有 | 已注册全部 7 个 Composition |

#### 接口定义

```javascript
// composition-manager.js
class CompositionManager {
  registerDefaultCompositions()     // 初始化时注册
  listCompositions()                // [{id, name, description, thumbnail}]
  getComposition(id)                // 返回单个 Composition 详情
  buildRenderProps(id, userParams)  // 用户参数 → render-engine props
  validateProps(id, props)          // 渲染前校验
}

// IPC 映射:
// render:list-compositions → compositionManager.listCompositions()
// render:get-composition → compositionManager.getComposition(id)
// render:start → compositionManager.buildRenderProps() + renderEngine.render()
```

#### 质量门禁

- [x] `render:list-compositions` 返回 7 个 Composition (7/7 测试通过)
- [ ] 每个 Composition 可渲染出 mp4 文件
- [x] 旧调用（默认 Explainer）向后兼容
- [x] composition-manager.test.js 覆盖全部接口 (31 测试全通过)

---

### Phase 2（P1）— AI + 视频工具桥接（3 周）

**目标**: 通过 python-bridge.js 调用已存在的 60+ Python 工具

#### 新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `services/ai-generator.js` | 🆕 新增 | 桥接 AI 视频/图像/音频/TTS 生成 |
| `services/video-engine.js` | 🆕 新增 | 桥接视频处理/分析/增强/字幕 |
| `ipc-handlers/ai.js` | 🆕 新增 | ai:list-providers / ai:generate / ai:test-connection |
| `ipc-handlers/video.js` | 🆕 新增 | video:process / video:mix-audio / video:analyze |

#### 架构

```
ai-generator.js
    │ 通过 python-bridge.js 调用
    ▼
Python 子进程: python <tool.py> --params <json>
    │
    ├── providers/video/hunyuan_video.py
    ├── providers/audio/elevenlabs_tts.py
    ├── providers/image/flux_image.py
    └── ...
```

```javascript
// ai-generator.js
class AIGenerator {
  listProviders(type)           // 'video'|'image'|'audio'|'tts'
  generate(type, provider, params, onProgress)
  testConnection(providerId)
  getProviderConfig(providerId)  // 不含 API Key
  updateProviderConfig(id, config)
  listModels(providerId)
}

// video-engine.js
class VideoEngine {
  mixAudio({narration, music, sfx}, output, onProgress)
  process(type, params, onProgress)  // green-screen|reframe|trim|bg-remove|...
  analyze(type, filePath)            // scene-detect|transcript|face-track
  searchStock(query, source, limit)
  generateSubtitle(audioPath, language)
  checkFfmpeg()
}
```

#### 质量门禁

- [ ] 至少 1 个 AI 工具通过 ai-generator.js 可调用成功
- [ ] 离线工具（分析/增强）可在无网络时运行
- [ ] API Key 加密存储（复用 credential-store）
- [ ] python-bridge.js 超时处理（默认 120s，视频 300s）

---

### Phase 3（P2）— Pipeline 编排 + 完整 UI（4 周）

**目标**: 创建 pipeline-engine.js 和完整视频创作 UI

#### 新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `services/pipeline-engine.js` | 🆕 新增 | 13 条管线编排 |
| `ipc-handlers/pipeline.js` | 🆕 新增 | pipeline:list/start/pause/resume/cancel/status |
| Vue 创作页面 | 🆕 新增 | 选择 Composition → 填参数 → 预览/渲染 |
| Vue Provider 配置页 | 🆕 新增 | AI Provider 配置管理 |
| Vue 管线执行页 | 🆕 新增 | 管线状态/检查点/进度 |

#### 接口

```javascript
// pipeline-engine.js
class PipelineEngine {
  loadPipeline(id)
  listPipelines()
  start(id, params)
  pause()
  resume()
  cancel()
  getStatus(id)
  getHistory()
}
```

#### Vue UI 页面规划

| 路由 | 页面 | 功能 |
|------|------|------|
| `/create` | 视频创作 | 选择 Composition + 填参数 + 预览 + 渲染 |
| `/create/provider` | Provider 配置 | API Key / 模型选择 / 测试连接 |
| `/create/pipeline` | 管线执行 | 管线列表 / 当前状态 / 检查点确认 |
| `/create/history` | 创作历史 | 已渲染视频列表 / 重新发布 |

#### 质量门禁

- [ ] 至少 1 条完整管线可执行
- [ ] 检查点可暂停/恢复
- [ ] 渲染进度实时推送（IPC progress）
- [ ] 渲染完成后可一键进入发布流程

---

## 四、与重构方案的关系

| 并行流 | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| **本架构** | composition-manager.js | ai-generator + video-engine | pipeline-engine + UI |
| **重构方案** | 文档治理 + TS 清理 | DI + main.js 拆分 | JS 巨石拆分 |

两个方案涉及的代码文件不重叠，可完全并行推进。

---

## 五、依赖与风险

### 5.1 外部依赖（全部已有）

| 依赖 | 用途 | 来源 |
|------|------|------|
| Node.js | Electron 运行时 | ✅ 已有 |
| Python 3.10+ | Python 工具执行 | ✅ 已有 |
| python-bridge.js | Electron↔Python IPC | ✅ 已有 |
| Remotion 4.0.x | 视频合成 | ✅ 已在 remotion-composer 锁定 |
| FFmpeg | 音频混流/视频处理 | ⚠️ 需打包静态编译版 |

### 5.2 风险

| 风险 | 影响 | 概率 | Phase | 应对 |
|------|------|------|-------|------|
| Python 依赖冲突 | 工具无法运行 | 中 | 2 | 每组工具独立 venv |
| AI 服务 API 变更 | 功能不可用 | 中 | 2 | 多提供商备选 |
| Electron iframe 限制 | 预览无法内嵌 | 低 | 3 | file:// 协议 + webSecurity: false（dev 模式） |
| Remotion 渲染慢 | 用户体验差 | 低 | 1 | 进度条 + 可取消 |

---

## 六、测试策略

### 6.1 测试文件

| Phase | 测试文件 | 覆盖 |
|-------|---------|------|
| 1 | composition-manager.test.js | Composition 注册/参数校验/渲染 |
| 1 | render-engine.test.js | 多 Composition 渲染 |
| 2 | ai-generator.test.js | AI 工具调用（mocked） |
| 2 | video-engine.test.js | 视频处理/混音 |
| 3 | pipeline-engine.test.js | 管线加载/状态转换 |

### 6.2 验证方式

- 单元测试：Vitest（Electron 侧）+ pytest（Python 侧）
- 集成测试：python-bridge.js 通信
- 手动验证：每个 Composition 渲染出 5 秒测试视频

---

## 七、时间线

| Phase | 周次 | 交付物 | 代码行预估 |
|-------|------|--------|-----------|
| 1 | W1-W2 | composition-manager.js + render-engine 扩展 | ~500 行 JS |
| 2 | W3-W5 | ai-generator.js + video-engine.js | ~800 行 JS |
| 3 | W6-W9 | pipeline-engine.js + Vue UI（3-4 页面） | ~2500 行 JS/Vue |

---

## 八、启用/禁用策略

视频创作功能默认禁用（设置页开关）。启用时：
1. 检测 Python 环境 → 未安装则引导
2. 检测 remotion-composer → 未安装则自动 npm install
3. 加载 composition-manager.js 等新 Service
4. 在侧边栏添加"创作"入口

禁用时：
- 不加载任何视频创作相关 Service
- 侧边栏不显示"创作"入口
- 不影响现有发布流程

