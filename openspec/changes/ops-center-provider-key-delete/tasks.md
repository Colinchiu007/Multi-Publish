## 1. 后端

- [x] 1.1 service.delete_provider_key + list_provider_keys 返回 id + router DELETE /providers/{key_id}（admin/404）
- [x] 1.2 测试：删除成功/403/404/删除后回退失效/删除后重建

## 2. 前端

- [x] 2.1 api/promptEval.js deletePromptEvalProvider + ModelKeys.vue 删除按钮（确认弹窗）

## 3. 验证与交付

- [x] 3.1 pytest（目标套件 + 全量）+ npm run build + vitest
- [x] 3.2 openspec validate + 审查
- [x] 3.3 推送 codex/ 分支 → PR → 合并 → 重启后端
- [x] 3.4 三同步归档
