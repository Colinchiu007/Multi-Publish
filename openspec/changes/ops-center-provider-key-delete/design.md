## 设计

### 后端
- `service.delete_provider_key(db, key_id: int) -> bool`：
  - `select(PromptEvalProviderKey).where(PromptEvalProviderKey.id == key_id)`；
  - 无行 → `raise ValueError("密钥不存在")`（router 转 404）；
  - 有行 → `db.delete(row)` + commit，返回 True。
- router `DELETE /providers/{key_id}`（path 参数 int）：
  - `Depends(require_admin)`（非 admin → 403，与 PUT/测试一致）；
  - 捕获 ValueError → HTTPException(404, "密钥不存在")。
- 删除后行为：`get_llm_key`（provider=minimax-llm）、`get_vision_key`（VISION_PROVIDERS）按 enabled=1 查询已删行不再命中，回退语义自动成立；无其他调用方持有行引用（行级删除，会话内无缓存）。

### 前端
- `api/promptEval.js`：`export function deletePromptEvalProvider(keyId) { return api.delete(`/prompt-eval/providers/${keyId}`).then(r => r.data) }`
- `ModelKeys.vue`：
  - 操作列新增「删除」`el-button type="danger" size="small"`（`loading` 单独行状态）；
  - `removeRow(row)`：`ElMessageBox.confirm(provider/model, '确认删除该密钥？', { type: 'warning' })` → `deletePromptEvalProvider(row.id)` → `ElMessage.success` + `load()`；取消静默。
  - 需确认 `items` 行含 `id`（后端 list_provider_keys 当前未返回 id → 需补 `id` 字段返回）。

### 数据契约
- `list_provider_keys` 返回值增加 `id`（前端删除按钮需要；纯增量，兼容旧前端）。
- 删除是物理删除（无软删除列），符合「密钥条目即配置」语义。

## 测试
- 后端 `test_prompt_eval_api.py`：
  - admin 删除已保存密钥 → 200/204 + 列表不含该项 + 删除后 get_llm_key 不再命中；
  - 非 admin 删除 → 403；
  - 删除不存在 id → 404；
  - 删除后再保存同名 provider+model → 可重建（唯一约束不冲突）。
- 前端：`npm run build` + 既有 vitest（ModelKeys 无组件测试，不新增单测）。
