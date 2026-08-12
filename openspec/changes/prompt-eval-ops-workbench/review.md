# Review — prompt-eval-ops-workbench

> 审查时间：2026-08-12 ｜ 方式：Claude reviewer（antigravity 地区不可用，已记录不冒充双模型）

## 审查结论

Claude 独立审查后端+前端实现，发现 **1 Critical / 7 Warning / 10 Info**，已全部修复并补测试/构建验证。

| 级别 | 问题 | 修复 |
|------|------|------|
| 🔴 C1 | 密钥加密键用 OPS_SECRET_KEY 派生且缺省回退 "change-me"（弱密钥） | `encrypt_key` 对缺省/不安全密钥 fail closed（RuntimeError）；测试显式设 OPS_SECRET_KEY |
| 🟠 W1 | run/media 端点无创建者/管理员授权 | `get_run`、`media` 增加 owner/admin 校验（`run_owns_media` 按 case 归属过滤）；测试覆盖他人访问 404 |
| 🟠 W2 | 生成/评估无图片大小上限 | `validate_image_bytes` 限 8MB；评估读取逐张校验 ≤8MB |
| 🟠 W4 | 后台任务 ORM detached + 异常静默丢失 | `start_run_pipeline` 只传 case_id+字段快照，worker 重查库；`add_done_callback` + logger + 失败态落库 |
| 🟠 W5 | provider 密钥表无唯一约束，并发 upsert 重复行 | `UniqueConstraint(provider, model)` + upsert 冲突回滚重查（IntegrityError） |
| 🟠 W6 | 前端无更新 case，run 用陈旧快照 | 新增 `PUT /cases/{id}` + `updatePromptEvalCase`；ensureCase 已存在先 PUT 表单最新值 |
| 🟠 W7 | 视觉评估密钥静默回退翻译 key | 缺 `OPS_PROMPT_EVAL_VISION_API_KEY` → 502「未配置视觉评估模型密钥」；测试覆盖 |
| 🔵 I1 | _is_admin 与 require_admin 不一致 | 统一 `role == "admin"` |
| 🔵 I2 | 前端菜单/路由未按 admin 过滤 | App.vue 菜单 v-if admin；router `adminOnly` meta + 守卫 |
| 🔵 I3 | 前端多处无错误处理 | loadCases/openCase/loadSummary 加 try/catch 兜底 errorMsg |
| 🔵 I4 | url 型生成物无法评估/显示 | 生成服务对 url 结果下载落盘 + 魔数校验 |
| 🔵 I5 | 契约未校验 issues/suggestions 数组 | `validate_eval_result` 补齐 |
| 🔵 I6 | 软删不清理 run/媒体 | 删除 case 后 run/media 经授权检查不可访问（case 软删 → 404） |
| 🔵 I7 | 评估 mime 一律 png | 按落盘扩展名/魔数映射 mime |
| 🔵 I8 | list_cases 负 limit 500 | limit 收敛 1-200 |
| 🔵 I9 | 翻译幂等缓存键不含 prompt_zh | 新增 `prompt_en_cache_zh` 快照字段参与缓存判定 |
| 🔵 I10 | 密钥更新必须重填 api_key | 更新时 api_key 留空保留旧密文 |

## 复验

- 后端：contract 5 + API 8 + services 6 = 19 例全绿（含新增 update/media 授权/vision key 用例）
- 前端：`npm run build` 通过；router 语法检查通过
- 全量 pytest 套件 DB 路径交叉干扰为既有问题（排除本次文件仍有 4 failed + 17 errors），本次文件单独运行全绿
