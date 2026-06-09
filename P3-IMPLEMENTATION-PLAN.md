# P3 实施计划：发布能力增强 + 历史记录 + 定时任务

**预计工时**：4-6 小时

---

## P3-M1：公众号群发能力

**目标**：从"保存草稿"升级到"群发"

- 公众号草稿列表页 → 勾选草稿 → 点击群发
- 确认群发弹窗处理
- 扫码确认（如需）
- 群发结果回传

---

## P3-M2：发布历史

**目标**：每次发布结果持久化，前端可查看

- `electron/publish-history.js` — SQLite/JSONL 存储
- main.js IPC: `history:list`, `history:detail`
- 前端：新增"发布历史"页面或侧边栏

---

## P3-M3：定时发布

**目标**：指定时间自动执行发布队列

- `electron/scheduler.js` — node-schedule 或简单 setTimeout
- IPC: `scheduler:create`, `scheduler:cancel`, `scheduler:list`
- 前端：Publish.vue 增加定时选项
