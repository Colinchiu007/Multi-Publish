## 设计

### 现状
- `get_llm_key`（prompt_eval_service.py:315）：`provider=="minimax-llm" AND enabled==1 ORDER BY updated_at DESC` 取最新。
- `get_vision_key`（:397）：`VISION_PROVIDERS=("minimax-vision","opencode-go-vision")` 按 provider 优先级 + 每 provider 最新。
- `upsert_provider_key`（:256）：物理 upsert，无默认概念；`list_provider_keys`（:297）无 `is_default` 字段。
- 前端 `ModelKeys.vue`：表单 + 列表（编辑/测试/删除），无默认操作。

### 方案
1. **数据模型**（models.py `PromptEvalProviderKey`）：`is_default = Column(Integer, default=0)`，注释「LLM/视觉/生图分组唯一默认」。
2. **迁移**（prompt_eval_migration.py 新增 `ensure_provider_default_column`）：沿用既有幂等模式——`PRAGMA table_info(prompt_eval_provider_keys)` 探测，缺失则 `ALTER TABLE ... ADD COLUMN is_default INTEGER DEFAULT 0`；`main.py` lifespan 挂到既有 `ensure_prompt_eval_video_columns` 之后。
3. **分组映射**（prompt_eval_service.py）：
   ```python
   USAGE_GROUP_PROVIDERS = {
       "llm": ("minimax-llm",),
       "vision": ("minimax-vision", "opencode-go-vision"),
       "image": ("minimax-image", "flux", "hunyuan"),
   }
   def provider_usage_group(provider: str) -> str | None: ...
   ```
4. **`set_default_provider_key(db, key_id)`**：
   - 行不存在 → `ValueError("密钥不存在")`（路由 404）；
   - `enabled != 1` → `ValueError("请先启用该密钥再设为默认")`（路由 400，fail closed）；
   - 事务内：目标 `is_default=1`，同分组其他行 `is_default=0`，`updated_at/updated_by` 更新，commit。
5. **路由**：`PUT /api/v1/prompt-eval/providers/{key_id}/default`，`require_admin`，ValueError→400（存在性单独 404）。
6. **选择链路**：`get_llm_key` / `get_vision_key` 改为分组内 `ORDER BY is_default DESC, updated_at DESC` 取首条——有默认即用默认，无默认回退最新启用；`get_vision_key` 由「provider 优先级」改为「视觉分组整体取默认/最新」（当前仅 minimax-vision 配置，行为等价）。
7. **upsert 语义**：
   - 新增行：该行分组内无 `is_default=1` 的启用行 → 新行自动 `is_default=1`；已有默认 → 保持 `0`。
   - 编辑：若该行原是默认且 `enabled` 被改为 0 → 清空其默认（不自动转移）；否则保留。
8. **前端**：`api/promptEval.js` 加 `setDefaultPromptEvalProvider(keyId)`（PUT）；`ModelKeys.vue` 列表加「默认」el-tag 列 + 操作列「设为默认」按钮（`row.is_default` 或 `!row.enabled` 时 disabled + tooltip）。

### 测试
- `test_prompt_eval_api.py`：admin 设默认 200 且列表含 `is_default`；同分组唯一（设第二个清第一个）；跨分组互不影响；404；非 admin 403；禁用密钥 400；`is_default` 不进明文返回。
- `test_prompt_eval_services.py`：`get_llm_key`/`get_vision_key` 优先默认；新键自动默认；禁用默认键清空；删除默认键不残留。
- `test_prompt_eval_migration.py`：存量表无 `is_default` 时幂等补列且数据保留。
