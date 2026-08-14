# Review — video-prompt-lens-discipline

日期：2026-08-13
范围：prompt-engine（8020 上游）+ Multi-Publish（契约层）双仓库 diff（D:\Temp\review-pe.diff / review-mp.diff）

## 审查方式
- 按 CCG 双模型要求并行派发 antigravity + Claude
- ⚠️ antigravity：账号所在地区不可用（Eligibility check failed），降级
- ⚠️ Claude：codeagent-wrapper 两次 exit 1（无日志详情），降级
- 最终：主代理补位完整审查（逐行通读双仓库 diff + 真实调用实证）

## 发现

### 🔴 CRITICAL（已修复 + 回归验证）
- C1 | strategies/veo.py kling.py hailuo.py doubao.py build_system_prompt | 四子类覆盖的签名缺 character_count，而 VideoPromptBuilder 现在无条件透传 → optimizer 真实链路（platform 非 generic/seedance 且 context 含角色）必抛 TypeError
  - 实证：`get_strategy('veo').build_system_prompt(character_count=2)` → TypeError: unexpected keyword argument
  - 逃逸链：test_lens_discipline_in_all_platforms 调用不带 character_count；test_character_count_injected 只测 generic_video → 真实链路场景无测试覆盖
  - 修复：四子类签名追加 `character_count=None` 并位置透传 super()；测试追加真实链路断言（每平台 character_count=2 → 不抛错且 EXACT 注入）
  - 回归：56 项 pytest 全绿（含新断言）

### 🟠 WARNING（记录，不阻塞）
- W1 | optimizer.py derive_character_count | character_list 长度无上限：N>3 时生成 "EXACT N CHARACTERS" 与纪律段 "At most 3 recognizable characters" 自相矛盾。建议 Phase 2：N>3 时截断为 3 或调整纪律文案（产品语义决策，本次不改）

### 🟢 INFO
- I1 | base.py _coerce_constraints | `str(c).strip()` 两次调用；函数内 `import re` 建议提模块级
- I2 | base.py extract_video_meta / models.py | final_frame `[:500]` 与 Field(max_length=500) 双处维护；建议 FINAL_FRAME_MAX 模块常量（MP 契约 finalFrameMax:500 靠测试锚定，可接受）
- I3 | MP contract normalizeVideoMeta | 新字段缺失时 undefined 而非引擎默认 []/""；零回归友好，当前无下游消费，记录即可

## 结论
Critical 已修复并回归；W/I 记录待后续。允许合并。

---

## 移植评审补充（2026-08-14，Multi-Publish 契约移植 PR）

- 方式：双模型并行（质量节拍门禁）——antigravity 不可用（Eligibility check failed，地区限制，与历史一致）→ 降级记录；Claude 完整评审（session f8ac26f5-2a54-4a2c-af79-567d5a1ced2b）。
- 结论：0 Critical / 2 Warning / 5 Info。**W1 已修复**（positive_constraints 数组元素 String() 强转产生 "null"/"[object Object]" 垃圾约束 → 改为 filter(typeof string) 对齐 _normalizeExcludedCharacters 防御模式）；**W2 已修复**（change spec 措辞与实现统一：缺失字段不设键 undefined，由消费端按可选字段处理）；I1 补直测（非字符串元素丢弃 / final_frame 非字符串/纯空白丢弃），I2-I5 记录不阻塞。
- 回归：video-prompt-engine-contract.test.js 93/93 全绿；关联套件 240/240（prompt-engine-contract 11 / kernel 13 / bridge 7 / stages）。
