## ADDED Requirements

### Requirement: 常用双字词不得被字幕边界拆开

字幕切分器 SHALL 将共享规则表中的 `no_cut_bigrams` 词组视为不可切开的短语。对于“哪怕”“没法”“那些”“展现”等用户反馈词，任意切点 SHALL 不得落在词组内部，且 TypeScript、Electron JS 与 Python 端 SHALL 使用同一规则源。

#### Scenario: 用户反馈词保持完整
- **WHEN** 以 `min_chars=8`、`max_chars=15` 处理包含“哪怕朱元璋”“暂时没法彻底”“只是这里的那些”或“实际行动展现出”的文本
- **THEN** 输出 SHALL 不包含“哪｜怕”“没｜法”“那｜些”或“展｜现”的边界，且拼接后保留原文字符顺序

### Requirement: 未闭合引号不得吞掉后续正文

字幕清理遇到未闭合或多余引号时 SHALL 只处理无法配对的引号字符，正文内容 SHALL 保持可见并参与后续长度切分；句界处理 SHALL 不因单个未闭合半角引号永久屏蔽后续句号。

#### Scenario: 未闭合半角引号后的正文保留
- **WHEN** 文本包含 `前朝。"字里行间全在抱怨元末群雄。` 且没有对应闭引号
- **THEN** 字幕 SHALL 保留“字里行间全在抱怨元末群雄”的正文，不得输出空块或丢弃后续文本；未配对引号可被规范化移除

#### Scenario: 对称半角引号仍正常闭合
- **WHEN** 文本包含 `他说"元以宽失天下"。`
- **THEN** 成对引号内容 SHALL 保持为一个可见片段，后续句号 SHALL 正常形成句界

### Requirement: 三端共享回归

同一输入和字幕配置经 TypeScript、Electron JS 与 smart-sentence-splitter Python 端处理时 SHALL 输出逐块一致，且共享向量 SHALL 锁定新增边界与引号场景。

#### Scenario: 完整用户文案回归
- **WHEN** 三端处理用户提供的明代士绅文案
- **THEN** 结果 SHALL 逐块一致，保护词不跨块，正文拼接覆盖原文（忽略块尾句读和被规范化移除的未配对引号）
