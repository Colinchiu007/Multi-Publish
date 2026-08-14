## MODIFIED Requirements

### Requirement: 术语词典
产品名词（如「故事讲述 / Story Telling」）SHALL 有集中维护的术语词典；当词典中的 zh 名词在任一 locale 文案中发生变更时，门禁 SHALL 校验对应 en 名词映射在 en 文案中已同步（或输出未同步候选词）。

#### Scenario: 词典名词只改了中文
- **WHEN** zh 文案将「故事讲述」改为新名词而 en 文案仍为旧映射
- **THEN** 术语校验失败或输出 en 侧未同步候选词清单

#### Scenario: 词典名词成对更新
- **WHEN** zh/en 文案同步更新为词典中的新映射
- **THEN** 术语校验通过
