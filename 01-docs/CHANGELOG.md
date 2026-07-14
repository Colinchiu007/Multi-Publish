# CHANGELOG

## [Unreleased] - 2026-07-14


### P1-C Phase 2.1 — bootstrap.js 拆分 phase1-context.js (质量节拍 Phase 2)

#### 拆分范围
- **新建**: `electron/bootstrap/phase1-context.js` (130 行，DI 实例提取 + 模块单例副作用)
- **新建**: `electron/bootstrap/phase1-context.test.js` (9 用例)
- **修改**: `electron/bootstrap.js` (339→238 行，-101 行，累计 359→238 = -33.7%)
- **修复**: `test-setup.js` mock 路径匹配（Windows 路径分隔符标准化）

#### 拆出职责
- 所有 `container.get(...)` 调用（17 个 DI 实例）
- 模块单例 + 副作用（seedDefaults / startMonitoring / registerIpcHandlers）
- scheduler / BatchManager / offlineManager 的 setTaskQueue 接线
- ModelProviderManager 接线
- 平台配置 / 敏感词 / 横切服务加载
- 从 `createAppContext()` L48-164 拆出

#### 保留原位（高风险）
- `taskQueue.setExecutor` 闭包（依赖 getMainWin + publisherRouter + rpaViewManager）
- `wireTaskQueueEvents` 调用（依赖 getMainWin）

#### 行为等价性
- 原: 140 行 inline（DI 提取 + 副作用 + setExecutor + 事件接线 + return）
- 新: `const ctx = extractContext(container)` (1 行) + setExecutor 保留 + wireTaskQueueEvents 保留 + `return ctx`
- 内部逻辑完全一致，仅函数封装不改执行序

#### test-setup.js 修复
- 问题: `__registerMock('./services/x', ...)` 注册的 mock，从子目录 `require('../services/x')` 时匹配失败
- 原因: Windows 上 resolved 路径用 `\`，mock key 用 `/`，`includes()` 匹配失败
- 修复: 标准化两者路径分隔符为 `/` 再匹配

#### 测试覆盖
- phase1-context.test.js: 9/9 PASS
- bootstrap.test.js: 44/44 PASS（回归无损失）
- bootstrap 目录全量: 26/26 PASS
- electron/ 目录: 709/709 PASS（1 文件加载失败为预存 path-utils 问题）


### P1-C 试点 — bootstrap.js 拆分 phase2-bridges.js (质量节拍 Phase 2)

#### 拆分范围
- **新建**: `electron/bootstrap/phase2-bridges.js` (56 行，验收 ≤80 行 ✅)
- **新建**: `electron/bootstrap/phase2-bridges.test.js` (6 用例)
- **修改**: `electron/bootstrap.js` (359→339 行，-20 行)

#### 拆出职责
- Python bridges 启动（pythonBridge + splitterBridge + promptBridge）
- before-quit 退出清理（stop 调用，容错隔离）
- 从 `runWhenReady()` L210-235 拆出

#### 行为等价性
- 原: 26 行 inline（pythonBridge try-catch + Promise.allSettled + before-quit 注册）
- 新: `await startBridges({ app, pythonBridge, splitterBridge, promptBridge })` (1 行调用)
- 内部逻辑完全一致，仅函数封装不改执行序

#### 测试覆盖 (6/6 PASS)
1. 三个 bridge 全部启动成功 — 记录 2 条 info 日志
2. pythonBridge 失败 — 不阻断其他 bridge 启动
3. splitterBridge 失败 — promptBridge 仍启动，记录 warn
4. before-quit 注册 — 触发时调用 stop
5. before-quit 中 stop 失败 — 不影响其他 stop
6. promptBridge 失败 — splitterBridge 仍启动，记录 warn

#### 回归验证
- bootstrap 目录 17/17 全绿（phase2-bridges 6 + phase5-ipc 11）
- 全量 1894 passed / 25 failed（全部为预存失败，与本次拆分无关）
- 预存失败: CreateView.test.js (UI)、visual-testing、path-utils、container.setup (getComposerDir)

#### P1-C 试点结论
- ✅ 拆分模式有效（与 phase4-events/phase5-ipc 一致）
- ✅ 行为等价性验证通过
- ✅ 测试覆盖充分（6 用例覆盖正常/失败/清理）
- ⏳ 下一步: phase1-context.js + phase3-services.js（待用户确认）


### Phase 5 运营期收尾 — 性能/安全/运维三大报告更新 (质量节拍 Phase 5)

#### Phase 5.2 性能验证（修复后基线复测）
- **修复前→后**: 总内存 828.5 → 745.4 MB (-10.0%)，回到 800MB 阈值内
- **Electron**: 476.5 → 393.9 MB (-82.6 MB)，源于 container.js 真实循环依赖检测启用后 DI 容器去冗余
- **Node.js / Python**: 持平（修复集中在 Electron 主进程侧）
- **端口**: 8002/8013 保持 UP，零回归
- **健康评分**: 6/10 → 7/10
- **报告**: 01-docs/retros/benchmark-2026-07-14.md（追加第九章）

#### Phase 5.4 日常安全检查（P0 修复后复评）
- **安全评分**: 8.55/10 → 8.95/10 (+0.40，接近 9.0)
- **OWASP Top 10**: 4 项强化（A03 Injection / A05 Security Misconfig / A07 Auth / A08 Data Integrity）
- **新增 4 道安全防线**: P0-1 命令注入根除 + P0-2 桩实现替换 + P1-A 路径清理 + P1-B IPC 白名单
- **新增 25 个安全回归测试**: asset-generator (4) + container (10) + phase5-ipc (11)
- **门禁**: ✅ PASS (>= 8/10)，可推进至 Phase 5.6 月度审计
- **报告**: 01-docs/retros/cso-daily-2026-07-14.md（追加第八章）

#### Phase 5.5 运维手册更新（P0/P1 后新配置）
- **新增 env 变量**: `SPLITTER_DIR` / `PROMPT_DIR` / `FFMPEG_PATH` (3 个，全可选，有 process.cwd()/PATH fallback)
- **ffmpeg 跨平台查找顺序**: env → PATH → 常见安装位置 → null
- **IPC sender 白名单运维须知**: app:// + file:// 始终可信，dev localhost 可信，其他拒绝
- **容器循环依赖运维须知**: 启动错误信息含 "Circular dependency detected: A -> B -> A"
- **启动配置清单**: 5 项检查（3 env + 2 验证）
- **报告**: 01-docs/retros/ops-manual-2026-07-14.md（追加第十一章）

#### Phase 5 门禁结果
- [x] /investigate 无未解决告警 (Phase 5.1 零回归)
- [x] /cso daily 安全扫描通过 (8.95/10)
- [x] 性能指标在基线内 (745.4 MB < 800 MB 阈值)

#### 质量评分趋势
- 补跑前 6.2 → P0 修复后 8.0 → P1 修复后 8.5 → Phase 4 体检 8.5 → Phase 5 复评 8.95

### 安全加固 — P1 硬编码路径 + IPC sender 验证 (质量节拍 Phase 2)

#### P1-A: 硬编码开发者路径清理
- **严重级别**: HIGH (生产环境必崩)
- **问题**: 3 个文件硬编码 `D:/Data/projects/...` 开发者路径
- **修复**:
  - `splitter-bridge.js` L17: `D:/Data/projects/smart-sentence-splitter` → `process.cwd()` (env 优先)
  - `prompt-bridge.js` L16: `D:/Data/projects/prompt-engine` → `process.cwd()` (env 优先)
  - `story2video-compose-engine.js` L36: `D:\Projects\ffmpeg-7.1\...` → 跨平台常见安装位置查找
- **测试**: 36/36 改动相关测试通过

#### P1-B: IPC sender 来源验证
- **严重级别**: MEDIUM (恶意页面可调用 IPC)
- **问题**: `phase5-ipc.js` 中 `usage:stats/daily/track` 三个 handler 无 sender 验证
- **修复**:
  - 新增 `isTrustedSender(event, app)` 函数
  - 白名单：`app://` 协议、`file://` 协议、开发模式 `localhost/127.0.0.1`
  - 不可信来源返回默认值 + log.warn
- **测试**: phase5-ipc.test.js 11 个测试覆盖（可信/不可信/边界/null 防呆）

#### P1-C: bootstrap.js createAppContext 拆分（推迟）
- **原因**: 140 行核心启动代码，拆分风险高，需独立循环+完整测试覆盖
- **状态**: 列入技术债务，下个迭代处理

### 安全修复 — P0 命令注入 + P0 桩实现 (质量节拍 Phase 2)

#### P0-1: asset-generator.js 命令注入漏洞修复
- **严重级别**: CRITICAL (CVSS 9.8)
- **问题**: `spawn('python', [...], { shell: true })` 中 shell:true 允许恶意文本触发任意命令
- **修复**: `shell: true` → `shell: false`，参数通过数组直接传递给 Python 解释器
- **测试**: 新增 asset-generator.test.js，4 个安全回归测试覆盖 5 种 shell 元字符注入
- **文件**: `apps/desktop/electron/services/asset-generator.js` L148

#### P0-2: container.js 桩实现替换为真实实现
- **严重级别**: HIGH
- **问题**: `detectCircularDeps()` 返回硬编码 `{ hasCycle: false, cycle: [] }`，无真实检测
- **修复**:
  - `get()` 加入 `_resolving` Set 运行时循环依赖检测，发现环时抛错
  - `detectCircularDeps()` 改为"探测式"实现：遍历未初始化 factory，尝试解析触发环检测
  - `_lastCycle` 缓存上次检测到的循环
- **测试**: container.test.ts 新增 10 个测试（6 循环依赖 + 4 dispose）
- **文件**: `apps/desktop/electron/core/container.js` L17-21, L74-104, L138-161

#### 质量节拍日常循环 6 步全执行
- ⓪ pre-flight: 6 道防线检查通过
- ① 上下文检查: 读取 2 文件源码，发现审查报告误差（dispose 非死代码）
- ② 测试脑暴: 8+8 个测试场景，TDD 顺序
- ③ 增量实现: 2 文件修改 + 2 测试文件
- ④ 6 大专项审查: 全部 PASS（1 已知 P1 WARN 不在本次范围）
- ⑤ 文档更新: CHANGELOG + 本记录
- ⑥ AI 协作检查: 见会话总结

## [v2.3.55] - 2026-07-10

### 第三十一轮 — IPC handler EC 常量迁移
- 8 个 IPC handler 完成 EC 常量迁移，启用 VALIDATION_ERROR/NOT_FOUND/AUTH_ERROR 三类语义化错误码
- 修复 01-docs/CHANGELOG.md 乱码段（v2.3.37~v2.3.39 三个版本）+ 补齐 v2.3.42~v2.3.55

## [v2.3.54] - 2026-07-10

### 第二十九轮 — 3 启动 bug 根因深挖 + 安全 MAJOR 收尾
- 3 个启动 bug 根因：logger.js 悬空引用 / container.setup.js 解构错 / system-tray.js 缺降级
- 安全 MAJOR × 3：移除硬编码 CSDN appSecret / CORS 收紧 / API Key SHA-256 哈希存储
- 资源泄漏 MAJOR：auth-view-session.js restoreLocalStorage 加 10s 超时
- 一致性 MAJOR：apps/desktop/package.json 版本 2.3.44→2.3.53 + description 乱码修复

## [v2.3.53] - 2026-07-10

### 第二十八轮 — 环境启动 + 中文乱码定位 + R51 P0
- 环境从零搭建：npm install 1188 包 + electron 33.4.0 + Xvfb + 系统库 + 中文字体
- 中文乱码根因：headless 环境缺中文字体（非编码问题）
- 合并另一个会话 3 个启动 bug 修复：logger.js / container.setup.js 解构 / system-tray try/catch
- R51 P0 完成：24 文件扫描，仅 render.js render:start 需补 data 参数校验

## [v2.3.52] - 2026-07-10

### 第二十七轮 — 安全审计 + R14 资源泄漏 + R14 一致性
- 三路并行 agent 审查：安全审计(8维度) + R14资源泄漏(6子维度) + R14一致性(6子维度)
- 4 CRITICAL 全部修复：license-manager XOR→AES-256-GCM / python crypto.py salt 持久化 /
  batch-manager.js 事件监听修复 / 两份 error-codes.js 语义冲突
- 9 个高优先级 MAJOR 修复：文件句柄泄漏 / DB 连接泄漏 / 进程泄漏 / 监听器泄漏

## [v2.3.51] - 2026-07-10

### 第二十六轮 — R52 IPC 响应格式统一收尾
- 191/191 IPC handler 完成 R52 格式统一（100% 合规率）

## [v2.3.50] - 2026-07-10

### 第二十五轮 — R52 持续推进 + 错误码冲突解决
- desktop 侧 error-codes.js NOT_FOUND/TIMEOUT_ERROR/NETWORK_ERROR/IO_ERROR 改为 -10~-13
- 避免与 api-publish-engine 的 -4(exception)/-5(io_error) 冲突

## [v2.3.49] - 2026-07-09

### 第二十四轮 — R52 持续推进

## [v2.3.48] - 2026-07-09

### 第二十三轮 — R52 持续推进

## [v2.3.47] - 2026-07-09

### 第二十二轮 — R52 持续推进

## [v2.3.46] - 2026-07-09

### 第二十一轮 — R52 启动

## [v2.3.45] - 2026-07-09

### 第二十轮 — 质量节拍启动

## [v2.3.44] - 2026-07-09

### 第十九轮 — 预审

## [v2.3.43] - 2026-07-09

### 第十八轮 — 基础设施梳理

## [v2.3.42] - 2026-07-08

### 第十七轮 — 基础设施梳理

## [v2.3.41] - 2026-07-08

### 新增
- Phase 1 — OpenMontage 视频集成：composition-manager.js
  - 管理 7 个 Remotion Composition（Explainer / TalkingHead / CinematicRenderer / CollageBurst / TitledVideo / LyricOverlay / HeroTitle）
  - text/gallery/video 三种模式 props 生成
  - props 完整性校验
- render-engine.js 扩展：listCompositions / getComposition / validateProps
- IPC 端点：render:list-compositions / render:get-composition / render:validate-props
- preload.js 暴露 composition API 到渲染进程
- container.setup.js 注册 compositionManager

### 文档
- 01-docs/architecture-video-integration.md — OpenMontage 集成架构方案 v2.0


### 修复
- main.js DI 容器重构遗留编译错误（缺少 createContainer 导入等 4 处）
- main.js 移除 13 个被容器取代的直接 import，ESLint 归零（11 warnings → 0）

### 文档
- INFRA-001: jest 30 testRunner 子包解析失败（预存基础设施问题）

### 测试
- composition-manager.test.js: 7/7 通过


### 新增
- Phase 2 — AI + 视频工具桥接：ai-generator.js + video-engine.js
  - ai-generator.js：管理 18+ AI Provider（视频/图像/音频/TTS）
  - video-engine.js：10 种视频处理 + 5 种分析 + 10 素材源
  - 通过 python-bridge.js 调用 Python 后端 API
- IPC 端点：ai:list-providers / ai:generate / ai:save-config 等
- IPC 端点：video:process / video:analyze / video:mix-audio 等
- Python 后端 API 端点：/api/ai/* + /api/video/*（7 个新路由）
- preload.js 暴露 AI + Video API 到渲染进程
- container.setup.js 注册 aiGenerator + videoEngine

### 测试
- ai-generator.test.js: 8/8 通过
- video-engine.test.js: 5/5 通过


### 新增
- Phase 3 — Pipeline 管线编排：pipeline-engine.js
  - 13 条内容管线（animated-explainer / cinematic / talking-head 等）
  - 执行状态机：start / pause / resume / cancel / advance
  - 阶段进度跟踪 + 检查点确认
  - 执行历史记录
- IPC 端点：pipeline:list/get/start/pause/resume/cancel/status/advance/history/fetch
- preload.js 暴露 11 个 Pipeline API 到渲染进程
- container.setup.js 注册 pipelineEngine
- Python 后端已在 Phase 2 提供 /api/pipelines 和 /api/pipelines/{name}

### 测试
- pipeline-engine.test.js: 11/11 通过
- 全量 4 个新模块 31/31 测试通过
## [v2.3.40] - 2026-07-07

### 修复
- test_e2e_api.py: 断言修复 (platforms key)
- UAT-005: console.error -> logger (4 files)

### 测试
- Python: 1367 passed, 0 failed

### 推送
- GitHub main synced


## [v2.3.39] - 2026-07-07

### UAT 与 验收测试计划
- 依据 01-docs/UAT-PLAN.md 拆解 10 个验证任务，覆盖 30+ 验收点
- P0: 核心流程 (J1-J4) — 账号管理/发布队列/视频合成/内容采集
- P1: 重要功能 (J5-J7) — AI 生成/批量发布/数据统计
- P2: 增强功能 (J8-J10) — 评论管理/SQLite 持久化/监控告警
- 预留验收报告 6 个验证用例 (UAT-001~006)

## [v2.3.38] - 2026-07-07

### 测试 — video_compose.py 新增用例 21 条 (8%->28% 覆盖)
- _compare_transcript_to_script: 10 条 — 空 transcript / 字段缺失 / 字段类型 / 错误 JSON /
  空白内容 / 时间戳格式异常 / 长度不匹配 / 缺 token / 边界 / 多段对照
- _get_composition_id: 3 条 — 默认 / 命中 / 未命中
- _needs_remotion: 2 条 — 需要 / 不需要
- _resolve_subtitle_style: 7 条 — 默认 / playbook / edit_decisions / explicit /
  无效值 / None 处理
- 累计：1335+21=1356

### 文档
- 同步 1356 用例总数

## [v2.3.37] - 2026-07-07

### 测试 — scoring.py (video_creation) 28 条 (36%->72% 覆盖)
- _tokenize_text: 6 条 — 空 / 单 / 多 / 标点 / 重复 / None
- _compute_task_fit: 5 条 — 有 best_for / 无 best_for / 多平台匹配 / style 不匹配 / 边界
- _compute_control: 4 条 — 空 / 完整 / 部分缺失 / 异常类型
- ProductionPathScore: 分数计算/字段缺失
- format_ranking: top_n > list / 越界 / 排序
- _keyword_overlap: overlap 计算 vs Jaccard / 大小写不敏感 / 空集合
- _expand_synonyms: 同义词 / social 关键词
- rank_providers: 排序 / 分数相等 / 空列表
- 累计：1307+28=1335

### 文档
- 同步 1335 用例总数

## [v2.3.36] - 2026-07-07

### ?? -- downloader.py 18 ? (35%->68% ??)
- _guess_ext: URL ????? / ???? / ?????? / ????
- _get_sub_dir: video/image/cover/unknown ???
- format_size: ??/KB/MB ???
- http property: ??? / ??
- close(): ?? HTTP ???
- download: ???????? / ???? / ??? key / ????
- ????: 1289+18=1307

### ??
- ?? 1307 ????

## [v2.3.35] - 2026-07-07

### ?? -- _shared.py HTTP ???? 16 ? (62%->85% ??)
- generate_heygen_video: 9 ?? -- ?? API Key / ?? provider / ? ref / ? execution_id / text_to_video ?? /
  image_to_video(ref_url) / image_to_video(ref_path) / HTTP ??
- generate_ltx_modal_video: 7 ?? -- ?? endpoint / ? ref / ?????? / JSON ?? / ref_path / ref_url / ??? / ? video_url
- ????: 1273+16=1289

### ??
- ?? 1289 ????

## [v2.3.34] - 2026-07-07

### ?? -- _shared.py HTTP ?? 17 ? (26%->62% ???)
- poll_heygen: ????/?????/??/??/??/HTTP??/processing???
- upload_image_fal: ?? API Key / ????? / ???? / FAL_AI_API_KEY ?? / WebP ??
- upload_image_heygen: ????? / v2 ?? / v2 404 ??? fal / v2 500 ??? fal
- ?? respx mock httpx??? @patch???????????
- ????: 1256+17=1273

### ??
- _shared.py ???: 26%->~62%?? HTTP ???
- ?? 1273 ????

## [v2.3.30] - 2026-07-07

### 测试 -- _shared.py 43 例 (11%->26% 覆盖率)
- HEYGEN_PROVIDERS / WAN_VARIANTS / HUNYUAN_VARIANTS 等数据字典结构验证
- estimate_quality_cost / estimate_speed_runtime / estimate_local_runtime 纯函数
- get_torch_device: cuda/MPS/cpu 多场景
- local_generation_enabled/status: 环境变量控制
- local_install_instructions: 文档内容验证
- probe_output: ffprobe 成功/失败/无 ffprobe
- 测试总数: 1165+43=1208

### 验证
- _shared.py 覆盖率: 11%->26%
- 全部 1208 测试通过
## [v2.3.29] - 2026-07-07

### 测试 -- hf_utils 24 例 (32%->68% 覆盖率)
- _f() 浮点格式化 / escape_text() HTML 转义
- parse_json_output() 多行 JSON 解析
- compute_total_duration() cut 时长计算
- is_inside() 路径包含检查
- 测试总数: 1125+24=1149

### 验证
- hf_utils 覆盖率: 32%->68%
## [v2.3.28] - 2026-07-07

### 测试 -- upscale 10 例 + bg_remove 2 例
- upscale: MODELS 数据验证 / VIDEO_EXTENSIONS / get_status / 输入不存在错误路径
- bg_remove: get_status (rembg 未安装) / 输入不存在错误路径
- 测试总数: 1113+12=1125

### 验证
- upscale: ~15%->32%
- bg_remove: 49%->56%
## [v2.3.27] - 2026-07-07

### 测试 -- color_grade 15 例 (~30%->77% 覆盖率)
- PROFILES 数据结构验证 (7 个预设全检查)
- list_profiles() / _build_filter() 全分支覆盖
  - custom_vf / lut_path / profile / intensity blend
- execute() 错误路径 (文件不存在)
- 测试总数: 1098+15=1113

### 验证
- color_grade 覆盖率: ~30%->77%（剩余 14 行 FFmpeg 调用/LUT 路径）
## [v2.3.26] - 2026-07-07

### 测试 -- face_enhance 14 例 (48%->95% 覆盖率)
- PRESETS 数据结构验证 (9 个预设全检查)
- list_presets() / _build_filter() 全分支覆盖
  - custom_vf 优先 / presets 数组 / 单个 preset / 默认值 / 未知值
- execute() 错误路径 (文件不存在/无 preset)
- 测试总数: 1084+14=1098

### 验证
- face_enhance 覆盖率: 48%->95%（剩余 3 行 FFmpeg 调用）
## [v2.3.25] - 2026-07-07

### 测试 -- character_animation_utils 63% + publisher_manager 50%
- character_animation_utils.py: 27 例 (_slug/_character_color/_normalize_style/_write_json)
- publisher_manager.py: 11 例 (init/precheck/registry 委托/get_or_create/close_all)
- 测试总数: 1046+38=1084

### 验证
- 新测试: 186/186 passed (所有近期新增)
- character_animation_utils 覆盖率: 44%->63%
- publisher_manager 覆盖率: 38%->50%
## [v2.3.24] - 2026-07-07

### 测试 -- compose_utils.py 41 例 (21%->88% 覆盖率)
- is_image: 15 种扩展名全覆盖
- tokenize: 标点/数字/Unicode/大小写混合
- parse_probe_fps: 分数/浮点/边界值
- build_subtitle_style: 默认/自定义/边框/对齐
- read_text_file: 文件读取/路径对象/不存在
- 测试总数: 1005+41=1046

### 验证
- Python: 1046/1046 passed
- compose_utils.py 覆盖率: 21%->88%（剩余 ffprobe 依赖行）
## [v2.3.23] - 2026-07-07

### 测试 -- video_trimmer 60% + logging_setup 75% (21%->60% / 47%->75%)
- P0-2: video_trimmer.py 21 例 (_build_atempo_chain + 错误路径全覆盖)
- P0-2: logging_setup.py 8 例 (get_publisher_logger + log_call 装饰器同步/异步)
- 测试总数: 976+29=1005
- 项目总覆盖率: 36%->37%

### Bug 修复 -- _concat 的 finally 块 list_path 未初始化 (后测试驱动发现的 bug)
- video_trimmer.py _concat(): list_path 初始化 None + finally 判 None 保护
- logging_setup.py log_call(): asyncio.iscoroutinefunction 判断使装饰器同时支持同步/异步函数

### 验证
- Python: 1005/1005 passed
## [v2.3.22] - 2026-07-07

### 测试 -- delivery_promise + hyperframes_style_bridge (0%->100% 覆盖率)
- P0-2: delivery_promise.py 46 例 (纯数据+逻辑, PromiseType/validate_cuts/classify_from_brief)
- P0-2: hyperframes_style_bridge.py 31 例 (纯函数, _first/_font/_motion_easing/style_bridge)
- 测试总数: 898+77=975
- Python lint: 13->8 (5 个自动修复)

### 验证
- Python: 975/975 passed
## [v2.3.21] - 2026-07-07

### 测试 -- media_profiles 11 例 (0%->100% 覆盖率)
- P0-2: 补充 media_profiles 模块单元测试 11 例
- 覆盖 AspectRatio/MediaProfile/get_profile/ffmpeg_output_args
- 测试总数: 887+11=898

### 验证
- Python: 898/898 passed

## [v2.3.20] - 2026-07-07

### 测试 -- slideshow_risk 18 例 (0%->93% 覆盖率)
- P0-2: 补充 slideshow_risk 模块单元测试 18 例
- 覆盖 6 个评分维度 + 主函数全部路径
- 测试总数: 869+18=887
- 项目总覆盖率: 34%->35%

### 验证
- Python: 887/887 passed

## [v2.3.19] - 2026-07-07

### 代码质量 -- N803 参数命名清零 (3->0)
- query_worker.py: localStorage -> local_storage (参数/属性/方法)
- lint 从 14 降至 11 (剩余 E402/N801/N806/B027/N802/N818)

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors

## [v2.3.18] - 2026-07-07

### 代码质量 -- B017 + PRD 版本同步
- B017: pytest.raises(Exception)->ValueError
- PRD 版本更新 v2.3.8 -> v2.3.17

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors

## [v2.3.17] - 2026-07-07

### 代码质量 -- B904 异常链清零 (19->0) + B018
- 19 处 B904 raise-without-from-inside-except 全部修复
- 1 处 B018 useless-expression (None -> pass)
- server.py/client.py/douyin.py/_utils.py 共 5 文件
- Python lint 从 71 降至 15 (剩余 E402/N803/N801 等命名风格)

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors

## [v2.3.16] - 2026-07-07

### 代码质量 -- Python lint unsafe fixes (27) + vitest config CJS
- 27 项 unsafe-fixes lint (UP042 StrEnum, UP045/UP046 类型标注, B905 zip strict, B007/N806 命名)
- vitest.config.js: ESM import/export -> CJS require/module.exports (兼容非 type=module 包)

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors
## [v2.3.15] - 2026-07-07

### 代码质量 -- Python lint 增量清理 (17 auto-fixed)
- 修复 17 个 auto-fixable lint 问题 (F401 未使用导入 7 + I001 导入排序 3 + UP006 类型标注 6 + W292 换行 1)
- 剩余 55 个低优先 lint (B904 异常链/N803 命名风格等), 后续逐步处理

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors

## [v2.3.14] - 2026-07-07

### 代码质量 -- api-publish-engine TS 类型错误清零 (24-0)
- 修复 24 个 TypeScript 类型错误 (JSDoc 标注增强)
- BasePlatformAdapter: 添加 publish() @returns JSDoc, 消除 7 个 TS2416 继承签名不兼容
- BasePlatformAdapter.getReferer(): 添加 @returns {string} 标注, 消除 void 转换错误
- cancel-token.js: 添加 throwIfCancelled() @type 标注, 消除属性不存在错误
- retry-middleware.js: 添加 circuit breaker @type 标注, 消除 err.code 错误
- upload/base-provider.js: 添加 _doUpload() 抽象方法桩 + JSDoc 类型标注
- upload/http-provider.js, anti-detect.js: 添加 @returns 标注, 修复类型推断

### 验证
- TypeScript: 0 errors (原 24 errors)
- ESLint: 0 errors
- Python: 869 passed
- Jest: 207 passed (23 suites)
## [v2.3.13] - 2026-07-07

### 测试
- 补充 HttpClient 扩展测试 23 例 (覆盖率 58% → 88%)
  - HTTP 方法助手: put/delete/async_get/async_post/async_put/async_delete
  - 客户端生命周期: close_sync/close_async 幂等性
  - 错误路径: 代理错误、重试耗尽、_map_httpx_error
  - 深层异步: timeout/proxy/connection/HTTP 错误路径

### 验证
- Python: 869 passed ✅ (原 846 + 23)
- Jest: 207 passed ✅
- _http_client 覆盖率: 88% (原 58%)

## [v2.3.12] - 2026-07-07

### 测试
- 补充 _rate_limit 扩展测试 11 例 (覆盖率 89% → 94%)
  - parse_retry_after: Unix 时间戳模式、reset 秒数、无效回退、大小写
  - parse_rate_limit_limit: 正常/异常/缺失/大小写
  - parse_rate_limit_remaining: 大小写变体

### 验证
- Python: 846 passed ✅ (835 + 11)
- Jest: 207 passed ✅

## [v2.3.11] - 2026-07-07

### 代码质量 — Python F-level lint 清零
- 修复全部 23 个 F-level lint 问题 (F821/F841/F401/F811)
- **修复 3 个真实 bug**:
  - hyperframes_compose.py: _f 静态方法自我递归调用 (应实现 CSS 浮点格式化)
  - video_selector.py: supports 未定义变量 (移除无效引用)
  - video_stitch.py: 清理 ideo_codec/codec 变量名不一致
- **补充缺失导入**: hunyuan_video.py 补充 yping.Any, publisher_manager.py 提升 PublishResult 导入
- **清理**: eye_enhance.py/green_screen_processor.py 未使用变量替换为 _

### 验证
- Python: 835 passed ✅
- Jest: 207 passed (23 suites) ✅
- F-level lint: 0 errors ✅
- E/W lint: 31 (仅 E501 行长度，低优先)

## [v2.3.10] - 2026-07-07

### 修复
- Python 后端 11 个文件中的 F841/F821 真实 bug
- video_stitch.py: 修复 ideo_video_codec → ideo_codec 变量名双写 bug (影响 _resolve_normalization_target)

### 代码质量
- 未使用变量替换: start/ls/include_auto/opacity/msg_data_id/has_tags → _
- 注释掉无用代码块: probe_cmd (video_understand.py)
- 恢复 eye_enhance.py 中 operations 变量的正常使用

### 验证
- Python: 835 passed ✅
- Jest: 207 passed (23 suites) ✅

## [v2.3.9] - 2026-07-07

### 代码质量
- ruff format 统一格式化 Python 后端全部 194 文件
- 自动修复 102 个 lint 问题 (未使用导入/导入排序/多语句合并)
- 手动修复 5 个文件的多语句 Enum 定义 (分号 → 换行)
- 剩余 61 个低级 lint 告警 (长行/未使用变量) 留待后续清理

### 验证
- Python: 835 passed ✅
- Jest: 207 passed (23 suites) ✅
- tsc: 0 errors ✅

## [v2.3.8] - 2026-07-07

### 测试 (今日累计 +130，总 751)
- 遗留 47 个测试迁移到 packages/python-backend/tests/ → +55
- video_creation/scoring.py 评分引擎测试 → +23
- precheck.py PreCheck 引擎测试 → +8
- tikhub_bridge.py 桥接层测试 → +8
- _errors/_rate_limit/_retries/_auth 基础设施测试 → +54

### 清理
- 删除根目录 tests/ 中已迁移的遗留文件
- gitignore .coverage 文件

### 质量门禁
- ✅ Python: 751 passed (原 621, +130)
- ✅ 全部已推送 GitHub (main)

## [v2.3.7] - 2026-07-07

### 测试
- 补充 _errors/_rate_limit/_retries/_auth 基础设施模块单元测试 (54 tests)
- _error: 错误体系层级 / 脱敏 / HTTP状态映射
- _rate_limit: 限流header解析
- _retries: 重试策略/退避计算
- _auth: BearerAuth/AuthMiddleware

### 验证
- Python 测试: 751 passed

## [v2.3.6] - 2026-07-07

### 测试
- 补充 TikHubBridge 桩模块单元测试 (8 tests)
- 覆盖: 初始化/可用性/平台/资源方法/异步异常

### 验证
- Python 测试: 715 passed

## [v2.3.5] - 2026-07-07

### 测试
- 补充 PreCheck 引擎单元测试 (8 tests)
- 覆盖: CheckSeverity/CheckResult/DuplicateCheck/PreCheckEngine

### 验证
- Python 测试: 707 passed

## [v2.3.4] - 2026-07-07

### 测试
- 补充 video_creation/scoring.py 单元测试 (23 tests)
- 覆盖: ProviderScore/ProductionPathScore/_keyword_overlap 等

### 验证
- Python 测试: 699 passed

## [v2.3.3] - 2026-07-07

### 测试迁移
- 将根目录 tests/ 中 47 个遗留测试迁移到 packages/python-backend/tests/
- test_core_progress → test_progress 合并
- test_core_downloader → test_downloader 合并
- test_core_scheduler → test_publish_scheduler 新建
- test_core_task_queue → test_task_queue 新建
- test_platform_e2e → test_models 合并

### 验证
- Python 测试: 676 passed (+55)
## [v2.3.2] - 2026-07-07
### 测试
- 补充 pagination 分页工具单元测试（13 tests）
  - OffsetPaginator: build_params/has_next/next_page
  - CursorPaginator: build_params/has_more
  - Page: 默认值/自定义构造

### 验证
- Python 测试: 621 passed (+13)
## [v2.3.0] - 2026-07-07
### 测试
- 补充 HttpClient HTTP 客户端单元测试（12 tests）
  - 认证管理: set_auth/clear_auth/空token
  - HTTP 请求: GET/POST 成功
  - 错误映射: 404/500 → MultiPublishHTTPError
  - 重试逻辑: 超时/连接错误/500→200恢复
  - Authorization header 验证
  - 使用 respx mock 框架模拟 HTTP

### 验证
- Python 测试: 590 passed (+12)
- Jest 测试: 207 passed
## [v2.2.9] - 2026-07-07
### 测试
- 补充核心数据模型 models.py 单元测试（19 tests）
  - 5 个 Enum: PlatformCategory/PlatformType/TaskStatus/PublishMode/PublishPhase
  - PLATFORM_META 完整性: 12 平台全覆盖
  - AuthData: is_empty/to_dict/from_dict roundtrip
  - PublishResult: success/failure 路径
  - PublishTask: 初始化/is_finished/to_dict
  - ProxyConfig: to_dict/from_dict roundtrip
  - PlatformAccount: 初始化/代理配置

### 验证
- Python 测试: 578 passed (+19)
## [v2.2.8] - 2026-07-07
### 测试
- 补充 config_model 配置模型单元测试（9 tests）— BudgetMode/BudgetConfig/OutputConfig/PathsConfig/VideoCreationConfig load/resolve

### 修复
- VideoCreationConfig.load() YAML 加载时不转换嵌套 dataclass 的 bug
  - 新增 _from_dict() 方法递归构造 BudgetConfig/OutputConfig/PathsConfig

### 验证
- Python 测试: 559 passed (+9)
## [v2.2.7] - 2026-07-07
### 测试
- 补充 CostTracker 费用跟踪单元测试（9 tests）— 覆盖初始化/预算属性/estimate/reserve/complete/fail/CAP 模式超限/快照/持久化
- 补充 ToolRegistry 工具注册表单元测试（9 tests）— 覆盖初始化/注册/空名错误/get/list/clear/按tier筛选/长度
- 总计 Python 测试: 550 passed (+18)
## [v2.2.6] - 2026-07-07
### 测试
- 补充 ProgressThrottle 节流阀单元测试（7 tests）— 覆盖初始化/自定义参数/强制上报/首次调用/delta阻塞/时间阻塞/reset
- 补充 PlatformRegistry 平台注册表单元测试（7 tests）— 覆盖默认注册表/is_supported/JSON加载/注册注销/get调用/异常/scan
- 总计 Python 测试: 532 passed (+14)
## [v2.2.5] - 2026-07-07
### 重构
- Python 后端 import 排序统一 + 类型提示现代化（119 文件）
  - isort 风格统一: stdlib → 第三方 → 项目内导入，字母序排列
  - Python 3.10+ 类型语法: Optional[X] → X | None, Dict/List/Tuple → dict/list/tuple
  - 移除未使用导入（typing.Any, pathlib.Path 等）
  - 补充文件末尾缺失的换行符
  - wechat_publisher/models.py 完整类型现代化

### 验证
- Python 测试: 518 passed ✅
- 改动涉及 119 文件 ±678 行
## [v2.2.4] - 2026-07-07
### 测试
- 补充 pipeline loader 模块测试（17 tests）— 覆盖 11 个 manifest 函数
  - test_pipeline_loader.py: get_stage_order / get_required_tools / get_stage_skill
    / get_stage_review_focus / check_extension_permitted / _condition_is_active 等

### 统计
- Python 测试: 518 passed (+71)
- Jest 测试: 207 passed
- Vitest 测试: 1056 passed
- **总计: 1781 tests ALL GREEN**

## [v2.2.3] - 2026-07-07
### 测试
- 补充 OpenMontage Phase 5-7 模块测试（enhancement/subtitle/capture/avatar/character）共 54 个新测试
  - test_enhancement.py: 23 tests — 6 个增强工具（BgRemove, ColorGrade, EyeEnhance, FaceEnhance, FaceRestore, Upscale）
  - test_subtitle_capture.py: 15 tests — SubtitleGen 纯 Python 字幕生成 + ScreenRecorder/CapRecorder
  - test_avatar.py: 6 tests — LipSync + TalkingHead 口型同步
  - test_character.py: 10 tests — 6 个角色动画工具

### 修复
- color_grade.py: tier 值 CORE→ENHANCE 修正
- face_enhance.py: tier 值 CORE→ENHANCE 修正
- character/__init__.py: 补全 6 个 BaseTool 子类的导出和 __all__

### 文档
- PRD 版本同步至 v2.2.2

### 统计
- Python 测试: 501 passed (447→501, +54)
- Jest 测试: 207 passed
- Vitest 测试: 1056 passed
- **总计: 1764 tests ALL GREEN**
## [v2.2.2] - 2026-07-06
### 修复
- TS 类型错误全面清零 — 修复 5 个服务文件 50 处类型错误
  - account.js: JSDoc 类型标注 + catch(e) unknown 安全处理
  - auth-view-cdp.js: 函数参数完整类型化
  - auth-view-session.js: Promise<> 类型 + 参数 JSDoc + once() 替代 on({once})
  - python-bridge.js: ChildProcess/NodeJS.Timeout 类型 + Error 类型守卫
  - auth-view-manager.js: 全类成员/方法 JSDoc + 成员变量类型化 + null 安全检查
- PipelineBrowser 集成到 CreateView（新增浏览管线模式）
- test:vue 207/207 全绿（tsc 0 errors + jest 207 passed）

## [v2.2.1] - 2026-07-06
### 里程碑
- check:all 首度全绿 ✅ (check:ts 0 errors + ESLint 0 errors + test:vue 1058 passed)
- JS 文件 TS 类型错误清零（108→0，三轮修复）
- 18 个服务文件 @ts-nocheck 确保 preload/浏览器上下文正确排除

### 改进
- 产品说明书版本同步至 v2.2.0
- product-manual.md 添加 PipelineBrowser 引用
- PRD 版本同步至 v2.2.0

## [v2.2.0] - 2026-07-06
### 重构：根目录清理 (P1-4)
- 删除 6 个冗余根目录：03-config / 04-tests / 05-standards / 06-scripts / team / team-workflow
- 03-config/ → 删除（与 config/ 完全重复）
- 04-tests/ → test_wechat_publisher 迁移至 packages/python-backend/tests/
- 05-standards/（3 份开发规范）→ 迁移至 01-docs/
- team/scripts/（2 份 CI 脚本）→ 迁移至 scripts/
- conftest.py 合并到 python-backend/tests/
- 修复：移除 04-tests 旧测试文件（import 路径失效，已有替代测试）

## [v2.1.9] - 2026-07-06
### 基础设施清理
- 批量移除 UTF-8 BOM（122 个文件：apps/desktop 74 + packages 29 + 01-docs 19）
- 消除 Vitest/PostCSS/Python ast.parse 因 BOM 导致的解析风险
- 技术债务记录更新：BOM 残留 ✅ 已修复

### 安全审计 (/cso)
- 扫瞄 apps/desktop/electron, src, rpa-engine, shared-utils, api-publish-engine, python-backend
- 结果：0 CRITICAL / 0 MAJOR（全部误报 — Electron 安全配置正确）

## [v2.1.8] - 2026-07-06
### 新增
- PipelineBrowser 管线浏览器组件（Vue SFC）：加载/空/错误/管线卡片 四种状态
- Pipeline IPC handlers（pipelines:list / pipelines:get）
- Python 后端 /api/pipelines 路由 + 4 个单元测试
- 视频创作管线 API 集成到主进程（ipc-handlers/index.js 注册）

### 改进
- gitignore 增加 NUL 设备和 test API keys 自动生成忽略规则
- 视频管线数据流：Vue 组件 → IPC（HTTP Bridge）→ Python 后端 → Pipeline Registry

### 技术
- PipelineBrowser 测试覆盖全部状态（loading / error / empty / card rendering）
- IPC handler 测试覆盖成功/失败/超时场景
- Python 路由测试覆盖列表/详情/404

## [v2.1.7] - 2026-07-06
### 里程碑
- ESLint 完全清零: 7 errors + 26 warnings 全部修复
# CHANGELOG



## [v2.1.7] - 2026-07-06
### 里程碑
- ESLint 完全清零: 7 errors + 26 warnings 全部修复
### 变更
- 修复 7 个 UTF-8 BOM 错误（no-irregular-whitespace）
- 替换 var → const/let（abort-utils.js, store-interface.js）
- 前缀化未使用参数 _e（catch 子句 + 回调参数）
- eslint 配置增强: varsIgnorePattern + caughtErrorsIgnorePattern
## [v2.1.6] - 2026-07-06
### 里程碑
- TS 迁移 Phase 3 完成: 86 个 JS 文件（含 3 层） electron/services 文件添加 @ts-check (100%)
### 修复
- 修复 vitest 2 个失败测试（publisher-router 错误消息中文化 + phase10 超时/axios mock）
- 修复 Jest 1 个失败测试（startup.test.js 错误消息中文化同步）
- 发布错误消息汉化: publisher-router.js "Platform not configured" → "平台未配置"
- 扩展覆盖: electron/core/ (3), ipc-handlers/ (20), publishers/ (2)
- 总计 86 个 JS 文件已添加 @ts-check

## [v2.1.5] - 2026-07-06
### 改进
- TS 迁移 Phase 3: 新增 5 个文件 @ts-check (cloud-publisher/publish-poller/store-schema/credential-store/scheduler)
- 累计 16/61 文件 ts-check (26% 进度)


## [v2.1.5] - 2026-07-06
### 改进
- TS 迁移 Phase 3: 新增 5 个文件 @ts-check (cloud-publisher/publish-poller/store-schema/credential-store/scheduler)
- 累计 16/61 文件 ts-check (26% 进度)

## [v2.1.4] - 2026-07-06
### 修复
- 测试基础设施大修：113 failed → 207 passed（jest 配置分离 + moduleNameMapper + ws mock）
- error-codes.js 同步 TS 源（修复 getMessage 缺失、错误码值不一致）
- 删除重复的 electron mock（electron/services/__mocks__/electron.js）
- publisher-router.js 中文模板字面量修复（checkJs 兼容性）

### 新增
- 34 个向后兼容的重定向文件（electron/X.js → electron/services/X.js）
- jest.config.cjs（限定 tests/ 目录为 Jest 范围）

### TS 迁移 Phase 3
- 新增 4 个文件添加 // @ts-check: cookie-converter, publisher-router, tasks-repo, media-downloader
- 累计 12/57 文件（21% 进度）
- 92 个渐进式 TS 类型待修复项

### 测试
- Jest: 207 passed ✅
- Vitest: 1049 passed ✅
- Python: 443 passed ✅
- **总计: 1699 测试 ALL GREEN**

> 完整变更日志请查看 [01-docs/CHANGELOG.md](01-docs/CHANGELOG.md)
>
> 以下为精简版变更摘要：


## [v2.1.3] - 2026-07-06
- PR #303: Phase 4 清理 — electron 回滚 43→33 + 测试临时文件清理
- PR #304: TS 迁移 Phase 3 — JSDoc 渐进类型化基础设施 (tsconfig.check.json + check:ts)
- PR #305: TS 迁移 Phase 3 — 3 个服务文件类型化
- PR #306: TS 迁移 Phase 3 — video-uploader.js 类型化
- PR #307: 新增 wechat_publisher 模型+异常 24 个单元测试 (443 Python tests)
- PR #308: 根目录清理 — 合并 docs/references/standards 到 01-docs/
- PR #309: TS 迁移 Phase 3 — test-helpers.js 类型化 (累计 7/77)
- P0-3: 清理 browser_data 浏览器缓存 62MB
- PRD 版本同步 v2.1.2 → v2.1.3

### 累计状态
- Python 测试: 419 → 443
- TS 类型化: 7/77 服务文件
- 根目录: 减少 3 个冗余目录

## [v2.1.2] - 2026-07-06
- PRD v2.1.2 全面修复（14 项内容审查问题）
- 清空 9 个代码 TODO（data-sync.js / utils.py / test 文件）
- 大文件拆分收尾：修复 video_compose.py 4 个缺失委托方法
- 决策日志更新至 D-018

## [v2.1.1] - 2026-07-06
- PRD 全面更新至 v2.1.1，补充 6 个使用流程章节
- 决策日志创建（01-docs/decision-log.md）
- 代码深度分析报告（01-docs/code-depth-analysis-2026-07-06.md）

## [v2.1.0] - 2026-07-05
- OpenMontage 全阶段集成（Phase 0-7）
- Pipeline 管线编排（13 种视频制作管线）
- 视频/图像/音频 AI 创作

## [v2.0.0] - 2026-07-02
- 内容智能模块（热点/标题/标签/爆款分析）
- 多平台实时监控 + 评论管理
- 云端发布 + Pro 版本 + 插件系统
- 发布日历与计划

## [v1.4.0] - 2026-06-28
- PreCheck 前端开关 + platforms.json 外部化

## [v1.3.0] - 2026-06-27
- AI 内容创作功能（AI Writer, 标题助手等）

## [v1.2.0] - 2026-06-26
- 插件系统 + 定时发布 + 评论管理

## [v1.1.x] - 2026-06-13 ~ 2026-06-17
- CLI 工具 + 内容格式化 + Docker 支持

## [v1.0.x] - 2026-06-03 ~ 2026-06-13
- 初始版本：Electron 桌面端 + FastAPI 后端
- 15 平台发布器 + 账号管理 + 内容智能分析



## [v2.1.3] - 2026-07-06
- TS 迁移 Phase 3: JSDoc 渐进类型化基础设施完成
  - 新增 tsconfig.check.json (extends 主 tsconfig, checkJs:false, noEmit)
  - logger.js + store-interface.js 添加 // @ts-check + 完整 JSDoc 类型
  - 新增 check:ts / check:all npm scripts
- 验证通过: check:ts ✅ build:ts ✅ test:vue (1049) ✅ Python (419) ✅

## [v2.1.3] - 2026-07-06
- PRD 版本同步 v2.1.2 → v2.1.3
- TS 迁移 Phase 3 继续: 新增 3 个服务文件 JSDoc 类型化
  - abort-utils.js: 修复 timeoutId/reason/Promise 类型
  - aggregator-bridge.js: 修复 class constructor @param + @returns 类型
  - first-run.js: 修复 catch(e) unknown 类型
  - 累计 5/77 服务文件已完成 JSDoc 类型化
  - check:ts ✅ build:ts ✅ test:vue (1049) ✅ Python (419) ✅




## [v2.2.5] - 2026-07-07
### 重构
- Python 后端 import 排序统一 + 类型提示现代化（119 文件）
  - isort 风格统一: stdlib → 第三方 → 项目内导入，字母序排列
  - Python 3.10+ 类型语法: Optional[X] → X | None, Dict/List/Tuple → dict/list/tuple
  - 移除未使用导入（typing.Any, pathlib.Path 等）
  - 补充文件末尾缺失的换行符
  - wechat_publisher/models.py 完整类型现代化

### 验证
- Python 测试: 518 passed ✅
- 改动涉及 119 文件 ±678 行




















