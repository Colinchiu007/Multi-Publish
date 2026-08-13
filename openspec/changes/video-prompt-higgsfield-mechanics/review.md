# 评审报告 — video-prompt-higgsfield-mechanics

> 日期: 2026-08-14 ｜ 方式: 双模型评审（质量节拍门禁） ｜ 结论: **修复后合入（Request changes → 已全部处理）**

## 评审执行记录

| 模型 | 状态 | 结果 |
|---|---|---|
| antigravity | ❌ 不可用 | `Eligibility check failed: not currently available in your location`（地区限制，与历史一致）；降级记录见下 |
| claude | ✅ 可用 | 完整评审返回：1 Critical + 6 Warning + 9 Info（session db3d8e9e-6ed6-475a-9120-abeb1a21135e） |
| 主代理补位 | ✅ 执行 | 独立核对契约层代码语义（positive_constraints 双形态、截断时序、场景映射），与 Claude 发现互证 |

## 问题分级汇总与修复状态

### Critical（1/1 已修复）

| ID | 问题 | 修复 |
|---|---|---|
| C1 | `color_ratio` 默认值三方矛盾：proposal 写"默认 60:30:10"，spec/tasks 写"缺失不填充"，且填充会违反零回归承诺 | D5 裁决：默认值归属**引擎侧**输出，契约层缺失不填充；proposal.md/spec.md/tasks.md 措辞统一 |

### Warning（6/6 已修复）

| ID | 问题 | 修复 |
|---|---|---|
| W1 | 请求侧默认 max_length=500 与精修层输出预算冲突，导演级输出在默认路径不可达 | 新增 spec R6 + design D6：creative_level ≥ 7 且未显式传值时默认 5000（≤20000），< 7 保持 500 零回归 |
| W2 | tasks 4.4 跨仓库验收遗漏 evaluator 规则违规扣分 | tasks 4.4 补 (c) 项：违规项正确扣分验收 |
| W3 | shots[] 局部非法语义未定义（duration 必填/clamp vs drop；shot/camera"枚举"措辞误导——契约层实为自由字符串 ≤50） | spec R2 明确：duration 必填、超限 clamp 15、单切任一子字段非法整切丢弃、shot/camera 沿用单切字符串约束；tasks 1.5 同步 |
| W4 | beats 丢弃与截断顺序不唯一（drop-before-truncate 结果不同） | spec R2 固化：先丢弃非法 beat 再取前 6；tasks 1.5 同步 |
| W5 | trailer 截断行为无 spec 场景 | spec R3 新增场景 3：超长截断保留 NON-IP 段、无残缺模板段；tasks 2.2 同步 |
| W6 | 完整性校验与 maxLength 截断时序未定义，长 prompt 截断可能误杀尾部 `[ABSENT]` 标记 | spec R4 明确校验基于**截断前**文本 + 新增场景 4（超长截断不误杀）；tasks 3.2 同步 |

### Info（9/9 已处理）

| ID | 问题 | 处理 |
|---|---|---|
| I1 | trailer 裁掉 `No {text}.` 段未记录原因 | design D7：no-text 由 BUILT_IN_VIDEO_NO_TEXT_NEGATIVE 负面词承载，模板不重复 |
| I2 | 去重大小写未定义 | spec R1：trim 后精确匹配去重，大小写敏感，保留首次序（`["JAX"," jax "]` → `["JAX","jax"]`） |
| I3 | color_ratio 边界与 `colorRatioMax=16` 魔数无来源 | spec R1 定义格式 `^\d{1,3}(:\d{1,3}){2}$`；tasks 1.1 移除魔数，改由 spec 推导 |
| I4 | no_swap_pairs 单元素非法取舍未定义 | spec R1：任一元素非法整对丢弃 |
| I5 | generic 画像缺 resolution/audio；audio bool vs string 桥接未定义 | spec R5：画像统一四键（duration/aspect/resolution/audio），桥接由调用方接线时转换 |
| I6 | `[ABSENT]` 大小写未定义 | spec R4：大小写敏感（与语料大写形态一致） |
| I7 | "7 个结构化字段"实为 8 个 | proposal/design 计数修正 |
| I8 | Req 4 无 no_swap_pairs 单独触发场景 | spec R4 新增场景 2；tasks 3.1 同步 |
| I9 | 新字段到消费方透传无约束 | design Non-Goals 明确：透传接线另行决策，不属本契约 |

## 主代理补位发现（与 Claude 合并）

- 补位 W1（excluded 应沿用 positive_constraints 字符串 split 兼容）→ 并入 spec R1 场景 2 + tasks 1.2（Claude 未覆盖，新增）
- 补位 W2（校验与截断时序）→ 与 Claude W6 合并，按上述修复
- 补位 Info（trailer 与 _extractVideoBase 截断集成用例）→ 并入 tasks 3.2
- 补位 Info（excluded_characters 与 positive_constraints 共存语义）→ 各自独立收敛，不阻塞（记录）

## 修复后校验

- `openspec validate video-prompt-higgsfield-mechanics --type change --strict` ✅
- spec 规模：6 Requirement / 20 WHEN-THEN 场景（评审前 5/13）
- tasks 规模：4 组 17 项（评审前 13 项）

## 遗留（不阻塞）

- 双模型评审的 antigravity 半侧持续不可用（地区限制），已按机制硬化规则降级为主代理补位并记录；后续会话可重试。
- 引擎侧 prompt-engine change（evaluator 规则扣分/层级长度、新字段输出、color_ratio 默认）未创建——tasks 4.4 挂起等待。
