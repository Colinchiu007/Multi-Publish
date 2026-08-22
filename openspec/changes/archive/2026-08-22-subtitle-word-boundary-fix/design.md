# 设计

## 决策

继续使用共享 `subtitle-rules.json` 作为词边界规则唯一来源，将 `哪怕`、`没法`、`那些`、`展现` 加入 `no_cut_bigrams`。`safeCutPosition` 和 `dropUnpairedQuotes` 已经遍历该集合/引号栈，因此不需要新增分词器。

未闭合引号清理保持现有“删除孤立引号字符”的职责，但不得把整块或引号后文本当作无效；对称半角引号仍按交替开闭处理。

## 风险

新增保护词可能改变少量长句的切点；以共享向量、TS/Electron parity、Python 向量和完整用户文案回归验证。
