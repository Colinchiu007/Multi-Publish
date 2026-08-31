# 视频创作流水线选项重组 + 运营中心选项控制模块

## 复杂度评估
- 复杂度：L+（跨模块：Electron 前端 + 运营中心后端 + 运营中心前端 + 配置持久化）
- 风险：高（修改现有 UI 行为 + 新增后端配置系统 + 桌面端联动）
- 领域：frontend + ops-center

## 需求分解

### A. 视频创作流水线选项重组（CreateView.vue）✅ 已完成
1. ✅ 移动「比例与分辨率」：画面 → 基础
2. ✅ 移动「语速」「旁白音量」：声音 → 基础（语速改名「旁白语速」）
3. ✅ 移出「内容类型」：基础 → 高级
4. ✅ 移出「图片生成器」：基础 → 画面
5. ✅ 基础说明文案修改
6. ✅ 「旁白语速」「旁白音量」旁增加「试听」按钮（按选定语速/音量播放试听音频）
7. ✅ 修复「音色复制 / 克隆」展开后区域变宽
8. ✅ 比例与分辨率下拉：新增一个比例 + 格式调整（1920x1080（横屏）→ 16:9横屏 1920x1080）

### B. 展开收缩调整 ✅ 已完成
- ✅ 仅「基础」默认展开，其他选项组默认收缩

### C. 配置相关 ✅ 已完成
1. ✅ 应用配置后显示「当前配置」：具体配置名字
2. ✅ 修复「我的配置」弹窗 tune 文字 + 操作按钮英文重叠（图标字体未加载）

### D. 运营中心「选项控制」新模块 ✅ 已完成
1. ✅ 选项显示开关：控制选项组（基础/画面/高级）与具体选项的显示/隐藏；「发布」组只控制整组
2. ✅ 选项初始默认值：设定所有选项默认值，显示方式类似桌面端 UI
3. ✅ 前端选项区域 UI 需兼顾所有选项的显示/隐藏，保持视觉统一（CSS grid auto-fill）

#### D-1. 后端 ✅
- ✅ PipelineOption 模型（pipeline_options 表）
- ✅ pipeline_option_service.py（CRUD + 校验 + get_bootstrap_options）
- ✅ pipeline_options.py 路由（GET /api/v1/pipeline-options + PUT upsert）
- ✅ runtime_service.py 集成（_get_pipeline_options → get_runtime_bootstrap）

#### D-2. 运营中心前端 ✅
- ✅ PipelineOptions.vue 管理页面（分组卡片 + 可见性开关 + 默认值输入 + 过滤 + 保存）
- ✅ API 客户端（listPipelineOptions, savePipelineOptions）
- ✅ 菜单项 + 路由注册

#### D-3. 桌面端 Electron ✅
- ✅ IPC 通道注册（license-access-control.js）
- ✅ IPC handler（ops-center-sync.js）
- ✅ Preload 桥接（system.js + index.bundle.js）
- ✅ Electron 服务（ops-center-sync.js: getPipelineOptions + runtime bootstrap 集成）

#### D-4. 桌面端前端集成 ✅
- ✅ API 导出（ops-center-sync.js: opsCenterSyncPipelineOptions）
- ✅ CreateView.vue 数据字段（s2vPipelineOptions, s2vPipelineOptionsLoading）
- ✅ loadPipelineOptions() 方法（mounted 中调用）
- ✅ applyS2VPipelineDefaults() 方法（应用默认值到 s2vConfig）
- ✅ s2vOptionVisible(optionKey) 方法（检查可见性，支持 group._group 级联）
- ✅ v-if 条件已添加到 30+ 个选项（覆盖 basic/visual/videoEnhance/voice/advanced/publish）
- ✅ 发布组特殊处理：v-if="s2vOptionVisible('publish._group')" 整组控制
- ✅ s2vSectionSummary 更新（basic 摘要改为分辨率+语速+音量）
- ✅ CSS grid auto-fill 保证隐藏选项后视觉一致性

### E. 其他
- ✅ 独立 worktree（mp-s2v-option-reorg-ops-control）
- ⬜ 更新记忆
- ⬜ 推送 GitHub、合并分支
- ⬜ 补充 PRD 和相关文档（详细：数据校验/流程/功能逻辑/交互/显示项/提示文字）
- ⬜ 应用质量节拍
