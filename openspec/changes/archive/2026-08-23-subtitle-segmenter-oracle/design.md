# 设计：字幕词边界 oracle 与完成体宾语保护
## 现状审计

已有分支修改已经接入 segmentit/jieba 的雏形、good_tail_blockers、显式短语保护和引号清理。本 change 只修正尚未完成的部分：二字 token 被 length < 3 过滤、token 映射失败的逐字符回退、Python jieba 检查位于不可达 return None 之后、TS 缺少 segmenterSpans 导入、以及 了 规则在优先级和最终 fallback 上的绕过。

## 方案

1. segmenterSpans(text) 仅保留至少两个连续 CJK 汉字的 token，验证原文切片、单调 cursor 和跨度边界；映射失败直接丢弃该 token。JS/TS 使用同一算法，Python 使用 jieba 的对应安全映射。
2. 缓存上限 256；TS/JS 返回新数组或不可变 tuple，避免调用方修改缓存。
3. isGoodCut 最先执行 cutAfterLeAllowed(text, i)，再检查 semantic/good lead/tail；最终候选 fallback 也执行同一个守卫。守卫只允许标点、空白和少量真实 clause starter，不把所有功能词当成默认可切。
4. 保持 no_cut_bigrams 作为跨分词器稳定合同；分词器只增加长度切分阶段的保护，不改变句界与在线字幕接受/回退逻辑。

## 方案选择

- 选择受限本地词边界 oracle，而不是把所有分词 token 变成绝对词典：它只影响无标点长度切分，失败时安全回退既有规则。
- 不引入词性标注判断“是否动词”：三端词性模型不一致，且字幕切分需要保守稳定；用 了 后守卫阻止普通汉字切点，使用显式 clause starter/标点保留真实语义边界。
- 不把 segmentit 直接强制用于 Python：Python sidecar 已以 jieba 为既有运行时约定，三端最终行为由共享 vectors 锁定。

## 风险与回退

- segmentit/jieba 词典差异可能导致新文本的边界不同；显式稳定词进入共享规则，未知词不做跨端逐字保证。
- 分词器缺失或异常返回空跨度，继续使用显式短语和字符规则；Electron 的实际运行依赖闭包仍通过 manifest/lockfile/ASAR 验证。
- 了 守卫过于保守时可能减少候选切点；最终仍有长度兜底，且标点/明确 clause starter 不受阻断。
