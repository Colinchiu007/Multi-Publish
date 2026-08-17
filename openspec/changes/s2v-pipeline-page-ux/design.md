## Context

CreateView 同时承载流水线选择、配置、运行进度和历史记录；CreateViewHistory 展示跨来源的项目记录与纯 run 记录；ResultView 读取 Story2Video 项目并编辑分段。运行态由 Electron 主进程 PipelineEngine 管理，历史快照由 run-state-store 保存。本 change 基于当前已交付的实现做基线审计，规格只记录本次 UI/IPC 统一与它需要的错误边界，不重新定义已存在的后台运行或并发合同。

## Goals

- 长页面中始终可见启动、暂停、取消、保存和合成操作。
- 让用户从历史记录直接找到“哪个视频”、当前状态和失败后应该做什么。
- 用一个编辑页承载任务查看与修改，避免详情弹窗和编辑页分叉。
- 保证 run 删除、暂停失败和音色目录失败不会产生假成功或半删除快照。
- 中英文文案、程序注释、PRD 与验收标准保持同一术语。

## Non-Goals

- 不改变流水线阶段顺序、provider 选择、合成算法或并发上限。
- 编辑页只在携带运行中 runId 时提供暂停 run 控制；它复用受校验的 pause IPC，不改变分段编辑数据或恢复语义。
- 不把“重新合成”和“再次合成视频”强行拆成新的后端 API；当前两个入口保留既有操作语义并共享重新合成调用。
- 不依赖仓库内构建残留作为测试 fixture；涉及文件系统的测试继续使用临时目录。

## Design Decisions

### 1. 固定区域与布局安全区

启动页操作条使用视口底部 fixed 定位，运行进度使用内容区域顶部 sticky；编辑页操作条使用 fixed 定位。内容容器通过底部 padding 预留操作条高度，窄屏将三个编辑按钮改为单列，避免按钮互相覆盖。操作条左侧根据易效页面 sidebar 宽度调整，不能遮挡导航。

### 2. 页面命名和路由

“流水线启动页”指 /create 中选择流水线后进入配置/运行的页面；“视频任务编辑页”指 /create/result?project=<projectId>。/create/history 重定向到 /create?view=history。历史卡片仅在具有 projectId 且不是 cancelled 时进入编辑页；没有项目的纯 run 记录只允许恢复或删除，避免打开无法编辑的空页面。

### 3. 历史卡片统一数据模型

卡片先通过标题回退链生成可识别名称：发布标题/项目标题 → 原文案前 60 个字符 → 流水线名称 → 未命名。通用字段始终保留；状态专属字段只追加到统一 body，不另起 CSS 模板。失败原因通过稳定错误码和本地化通知映射归一化，未知错误回退到自然语言通用提示，不展示 provider 原始 JSON、token、堆栈或长技术前缀。

### 4. Run 删除与暂停一致性

pipeline:delete-run 仅接受非空字符串 runId，运行中 run 拒绝删除；删除同时清理主 run、名称索引、history 与快照，任一步持久化失败都返回错误并保留可恢复状态。暂停在阶段对象、运行状态和 checkpoint 可序列化后才提交；保存失败恢复原 status/stage/checkpoint。所有 IPC 错误返回结构化 { code, message }，renderer 显示可操作的本地化提示。

### 5. 分段编辑与素材

编辑页以 projectId + 非空 segments 判定可编辑，videoPath 缺失不再阻断失败/暂停/未合成任务。分段跳转只操作本地 DOM ref，不改变数据顺序；上一条/下一条在首尾禁用。场景素材的生成视频动作读取当前分段 videoPrompt，无 prompt 时禁用。服务端已保存的 selectedMaterial 优先用于“当前使用”，没有视频文件时也不能凭候选数组顺序猜选中项。

### 6. 音色目录回退

只有 provider、model 上下文完整且目录返回非空时显示下拉；已有但不在目录的 voiceId 作为保留选项，避免编辑保存时丢值。目录请求失败显示本地化提示并回退文本框，不能阻断项目读取和分段保存。语速范围为 0.5..2.0，步长 0.1，与流水线启动页一致。

## Validation and Rollback

- 定向 Vitest 覆盖固定操作条、历史入口/删除、编辑页分段/音色，以及 pipeline-engine 和 IPC。
- locale pair/CJK、ESLint、worktree dependency resolution 和 Electron 打包均为交付门禁。
- 若固定操作条遮挡内容，优先调整 CSS safe-area 变量，不撤销操作可见性；若音色目录不可用，保持输入回退；若删除快照失败，保留 run 并提示重试。
