## 决策记录

### D1: 最小放行面
- 仅放行 `story2video:list-projects`（本地项目索引，owner 隔离）与 `pipeline:history`（内存/本地流水线历史，设备级）。
- 理由：这两个通道是**只读本地数据**，未登录放行不造成跨用户泄露（service 层按 owner 隔离）；`get-project`/`delete-project`/`update-segments` 等涉及文件读取/写操作保持收紧，控制权限面最小。
- 风险：`pipeline:history` 返回设备级所有 run 历史（不过滤 owner）——属既有设计（本地设备数据），未登录可见与「本地历史」语义一致。

### D2: 真实 e2e 验证
- 修复前用真实 Electron（playwright._electron）确认 `code:-3`；修复后同一脚本验证：不弹错 + 本地模式提示条 + 空态。

### 双模型审查
- Claude 独立审查（antigravity 降级记录）；重点：权限面最小化、owner 隔离是否仍生效、有无新的未登录数据暴露。
