## ADDED Requirements

### Requirement: 内容类型自动预选

CreateView 在文本输入就绪后 SHALL 检测 strong 历史信号（朝代命中，或 ≥2 个独立古代信号且无对立信号的 ancient strong）；检测到 SHALL 将「内容类型」默认值预选为 history，未检测到 SHALL 保持 general。预选 SHALL 对用户可见且可手动改回。

#### Scenario: 朝代命中预选
- **WHEN** 文本包含明确朝代/帝号关键词（如唐、宋、贞观）
- **THEN** 内容类型下拉被预选为 history

#### Scenario: 强古代信号预选
- **WHEN** 文本无朝代名但含 ≥2 个独立古代信号且无现代对立信号（如朝廷、皇帝、宫殿）
- **THEN** 内容类型下拉被预选为 history

#### Scenario: 弱信号不预选
- **WHEN** 文本仅含单一弱古代信号（如寺庙）
- **THEN** 内容类型保持 general

### Requirement: 用户选择优先（touched 语义）

用户手动更改过内容类型后，系统 SHALL 不再自动覆盖其选择；系统恢复上次选项时 SHALL 将恢复值视为用户偏好。

#### Scenario: 手动选择不被覆盖
- **WHEN** 用户手动将内容类型改为 general（或 history）后继续编辑文本
- **THEN** 内容类型保持用户所选值

#### Scenario: 恢复选项视为偏好
- **WHEN** 进入页面恢复上次保存的选项且快照 contentType 存在
- **THEN** 恢复值视为用户偏好，自动检测不再覆盖

### Requirement: 检测通道 fail-open

检测 IPC 失败、入参非法或文本为空时 SHALL 静默保持当前值，不得报错或阻断页面。

#### Scenario: IPC 失败
- **WHEN** 检测 IPC 返回非 0 code 或抛错
- **THEN** 内容类型保持当前值，页面无错误提示

#### Scenario: 空文本
- **WHEN** 文本为空或仅空白
- **THEN** 不发起检测，内容类型保持默认
