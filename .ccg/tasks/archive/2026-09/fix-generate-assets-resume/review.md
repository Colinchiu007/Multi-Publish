# 审查报告：修复 generate_assets 阶段断点续传不跳过已生成资源

## 变更概要

| 文件 | 变更行数 | 说明 |
|------|---------|------|
| pipeline-engine.js | +11 | 新增公开方法 saveRunningCheckpoint(runId) |
| story2video-stages.js | +47 | 新增 saveIncrementalResume 函数 + 9 处调用点 |

## 审查结论

### Critical: 无

### Warning: 无

### Info
1. saveIncrementalResume 为同步调用，不阻塞资产生成主流程。每次持久化 checkpoint 会触发一次 fs.writeFileSync，对大量场景（如 20+ 场景）可能产生 IO 开销。当前场景数通常 ≤10，可接受。
2. 新增的 saveRunningCheckpoint 公开方法仅内部调用（story2video-stages），不暴露给 IPC，安全性无问题。
3. 断点数据与 stage 失败时的快照数据格式兼容（均为 generate_assets.resume.completed 数组），无需迁移。

## 验证建议
1. 端到端测试：启动 generate_assets 阶段 → 生成 2-3 个资产后强杀应用 → 重启 → 从断点继续 → 验证已生成的资产被跳过
2. 检查 running checkpoint 文件中是否包含 generate_assets.resume 数据
3. 验证正常完成流程中，resume 数据在成功后被正确清理（delete context.generate_assets.resume）
