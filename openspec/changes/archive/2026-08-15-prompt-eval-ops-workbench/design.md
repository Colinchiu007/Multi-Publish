# Design — prompt-eval-ops-workbench

> 配套 PRD：ops-center/docs/PRD.md §12A.22；独立 PRD：01-docs/PRD-PROMPT-EVAL-OPS-WORKBENCH-2026-08-12.md

## 方案选型

| 决策点 | 方案 | 理由 |
|--------|------|------|
| A 生成能力 | 后台服务端直连模型 API（minimax-image/flux，OpenAI 兼容或原生 SDK） | 运营后台独立可控；密钥服务端持有；不跨端耦合 |
| A 密钥管理 | `prompt_eval_provider_keys` 加密存储 + admin 管理（复用 OPS_CATALOG_API_KEY 管理模式） | 密钥不出响应/日志/评估提示词 |
| B 中英对照 | 后台 LLM 翻译 prompt_zh→prompt_en，source=machine_translation，幂等 7 天 | 不改 prompt-engine（8013）契约；UI 标注机器翻译 |
| 视频 | v1 图片先行；v2 视频 | 与桌面端口径一致；生成/评估成本控制 |

## 关键设计

1. **契约复用**：`prompt_eval_contract.py` 定义与桌面端一致的 IMAGE_DIMENSIONS 权重、11 类问题、7 类优化点、severity 枚举；桌面端与后台各持一份并由一致性测试断言相等（避免跨语言共享库的依赖）。
2. **异步状态机**：run 状态 queued→processing→succeeded（生成）→ evaluating（评估）→ succeeded/failed；生成失败不降级，评估非法输出 eval_status=failed 且生成物保留；error 记录阶段+原因。
3. **fail closed 输入校验**：对齐桌面端矩阵（source_text ≤20000、prompt_zh ≤5000、context 递归敏感键、image_count 1-20、aspect_ratio 枚举、provider/model 必须已配置密钥）。
4. **服务端生成 prompt_en**：客户端不可伪造 source；翻译幂等缓存。
5. **生成物存储**：本地媒体目录/COS URL，不存 base64；删除 case 级联回收。
6. **生成 HTTP 客户端**：超时 + 有界瞬时重试 + 429 退避；响应必须为受支持图片（扩展名/魔数校验）。
7. **评估**：构造评估提示词（复用桌面端 prompt-builder 语义：输入快照 + JSON 契约），解析 + 白名单校验，非法即 eval_status=failed。
