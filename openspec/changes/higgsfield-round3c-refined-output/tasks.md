# Tasks — Higgsfield round3c refined 输出形态升级

## T1 语料统计脚本 + 资产（分族 + 统一正则）
- [ ] scripts/analyze_hg_corpus.py（只读 D:\Temp\hg-corpus；🔥 导演族 / 内联冒号族分族统计；块频率/tier/Audio/lock 词表含否定出现率）
- [ ] knowledge/refined_blocks.json（版本化：blocks/block_pattern/coverage min_ratio 0.8/enabled_rules 3 条/lock_triggers 否定感知词表）

## T2 引擎：models.py blocks 字段
- [ ] VideoPromptMeta + blocks: Optional[dict]（键白名单 12 + 值 ≤4000）
- [ ] 单测：非法键丢弃/非字符串丢弃/截断/空 dict → None

## T3 引擎：refined 模板（骨架 + FAIL CHECK + 注入强化）
- [ ] base.py refined Output Format 增加 blocks 字段说明与骨架顺序指令
- [ ] FAIL CHECK 收尾自审段（5 条，仅模板侧；timeline 判据含 CUT N）
- [ ] Skin/Acting 高频项注入强化（pore-level/eye-line）
- [ ] 单测：模板含新段/旧模板兼容/FAIL CHECK 不出现在渲染输出串尾

## T4 引擎：_clean_blocks + render 骨架化 + 尾行剥离
- [ ] extract_video_meta 清洗 blocks；render 按骨架顺序拼单串（缺失块回退旧字段；逐块去内嵌尾行）
- [ ] 单测：骨架渲染/回退/零回归（无 blocks）/内嵌尾行剥离/C6 截断交互不丢块

## T5 引擎：evaluator 块覆盖度 + gated 规则
- [ ] block_coverage（refined 分母=meta.blocks 非空块数，ratio<0.8 → -5 advisory；batch 不启用）
- [ ] 7 条 lock-gated 规则（否定感知；enabled_rules 默认 3 条；style_contamination 无 photoreal 锁词）
- [ ] 单测：覆盖正反例/gated 启用与关闭/否定词不计命中（"No 3D render"/"not overexposed"/"no waxy"）/refined 专属/尾行 photoreal 不触发 style_contamination

## T6 引擎：缓存盐 V4
- [ ] HIGGSFIELD_FMT_V3 → V4（与 round3b 同批，一次重建）
- [ ] 单测：旧缓存失效

## T7 契约：normalizeVideoMeta blocks 回显
- [ ] 白名单 + 截断 + 向后兼容
- [ ] 单测：合法/非法/缺省；与 extractOptimizedVideoPrompt meta.video 组合回归