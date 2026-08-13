# requirements.md — 需求与方案（2026-08-13）

## 问题
选择本地音频文件后自动克隆（上传 + 复刻，10~60s），期间仅按钮变灰 → 观感卡死。

## 方案（已实施）
1. 克隆中占位行（音色XXX 创建中 + spinner）
2. 按钮切「正在克隆…」+ role=status 状态行（含耗时预期）
3. 成功替换真实行 + 自动设默认 + 轻提示；失败/异常清除占位 + 友好错误
4. i18n 全量（cloneSelect/Reselect/InProgressButton/StatusPending/PendingLabel/SuccessToast）
5. 不动 IPC 契约；占位行不参与命名序号；reset/stale 时清理
