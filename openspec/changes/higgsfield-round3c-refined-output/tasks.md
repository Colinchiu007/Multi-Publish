# Tasks — Higgsfield round3c refined 输出形态升级

## T1 语料统计脚本 + 资产
- [ ] scripts/analyze_hg_corpus.py（只读 D:\Temp\hg-corpus，块频率/tier/Audio/lock 词表）
- [ ] knowledge/refined_blocks.json（版本化，阈值 N + lock_triggers）

## T2 引擎：models.py blocks 字段
- [ ] VideoPromptMeta + blocks: Optional[dict]（键白名单 12 + 值 ≤4000）
- [ ] 单测：非法键丢弃/截断/空 dict → None

## T3 引擎：refined 模板（骨架 + FAIL CHECK + 注入强化）
- [ ] base.py refined Output Format 增加 blocks 字段说明与骨架顺序指令
- [ ] FAIL CHECK 收尾自审段（5 条）
- [ ] Skin/Acting 高频项注入强化（pore-level/eye-line）
- [ ] 单测：模板含新段/旧模板兼容

## T4 引擎：_clean_blocks + render 骨架化
- [ ] extract_video_meta 清洗 blocks；render 按骨架顺序拼单串（缺失块回退旧字段）
- [ ] 单测：骨架渲染/回退/零回归（无 blocks）

## T5 引擎：evaluator 块覆盖度 + gated 规则
- [ ] block_coverage（refined 阈值 N，-5 advisory）
- [ ] 7 条 lock-gated 规则（默认 OFF，-5 advisory）
- [ ] 单测：覆盖正反例/gated 启用与关闭/refined 专属

## T6 引擎：缓存盐 V4
- [ ] HIGGSFIELD_FMT_V3 → V4
- [ ] 单测：旧缓存失效

## T7 契约：normalizeVideoMeta blocks 回显
- [ ] 白名单 + 截断 + 向后兼容
- [ ] 单测：合法/非法/缺省
