
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

> 完整变更日志请查看 [ 1-docs/CHANGELOG.md](01-docs/CHANGELOG.md)
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



















