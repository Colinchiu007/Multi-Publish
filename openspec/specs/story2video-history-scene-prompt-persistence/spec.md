# story2video-history-scene-prompt-persistence Specification

## Purpose
历史记录场景内容编辑的提示词显示完整性与保存可见性契约：详情只读列表完整展示旁白与图片提示词；结果页编辑未保存状态可见；离开页面时未保存修改必须经显式确认（保存/放弃/取消），不静默丢失。

## Requirements

### Requirement: 详情弹窗完整展示场景文案与图片提示词
历史详情弹窗的只读场景列表 SHALL 完整展示每个场景的旁白（text）与画面提示词（prompt），不得以 60 字符硬截断；字段存在才渲染对应行，长文本在列表内滚动查看。

#### Scenario: 长图片提示词完整可见
- **WHEN** 用户打开含 1500 字符图片提示词的历史详情弹窗
- **THEN** 场景列表完整展示该提示词（无 `…` 截断标记），旁白与画面提示词分行显示，列表可滚动

#### Scenario: 仅旁白或仅提示词
- **WHEN** 场景只有 text 或只有 prompt 之一
- **THEN** 仅渲染存在的字段行，不出现空行或占位文案

#### Scenario: 历史卡片预览保持截断
- **WHEN** 历史卡片列表展示提示词预览
- **THEN** 仍按 120 字符 + `…` 截断（预览语义不变），不受详情完整展示影响

### Requirement: 编辑未保存状态可见
结果页分段编辑区 SHALL 在存在未保存修改（segmentsDirty）时显示「有未保存修改」提示，帮助用户识别需要点击【保存分段】。

#### Scenario: 修改后提示出现
- **WHEN** 用户修改任一场景的旁白或画面提示词后
- **THEN** 分段编辑区标题行显示「有未保存修改」提示，且【保存分段】成功落库后提示消失

#### Scenario: 无修改不提示
- **WHEN** 页面加载且用户未做任何修改
- **THEN** 不显示未保存提示

### Requirement: 离开页面保存确认
结果页存在未保存修改时离开路由，SHALL 弹确认框提供三选一：保存并离开 / 不保存离开 / 取消；保存失败 SHALL 留在当前页并提示，不得静默导航或静默丢修改。

#### Scenario: 保存并离开
- **WHEN** 用户 dirty 状态点击返回并选择「保存并离开」
- **THEN** 先调用保存分段；保存成功后才导航离开，保存失败留在当前页并展示失败提示

#### Scenario: 不保存离开
- **WHEN** 用户 dirty 状态离开并选择「不保存离开」
- **THEN** 直接导航离开，不调用保存，修改被放弃

#### Scenario: 取消
- **WHEN** 用户 dirty 状态离开并选择「取消」
- **THEN** 留在当前页，编辑内容保持，不导航

#### Scenario: 无未保存修改直接放行
- **WHEN** 用户无未保存修改时离开
- **THEN** 不弹确认，直接导航

### Requirement: 文案成对与无中文字面量
新增用户可见文案 SHALL 以 locale 键（zh/en 成对）提供；渲染源文件（ResultView.vue / CreateViewHistory.vue）不得新增中文字符串字面量。

#### Scenario: locale 成对
- **WHEN** 新增「有未保存修改」与离开确认文案
- **THEN** `locales/zh.js` 与 `locales/en.js` 对应键均存在且 `check-locale-sync` 通过

## Test Mapping
- 场景「长图片提示词完整可见」→ `CreateViewHistory.test.js`（detailScenes 渲染完整 prompt、无 `…`、text/prompt 分行）
- 场景「仅旁白或仅提示词」→ `CreateViewHistory.test.js`（单字段场景不渲染空行）
- 场景「历史卡片预览保持截断」→ `CreateViewHistory.test.js` 既有 preview 断言保持
- 场景「修改后提示出现 / 无修改不提示」→ `ResultView.test.js`（dirty chip 渲染与保存后消失）
- 场景「保存并离开 / 不保存离开 / 取消 / 直接放行」→ `ResultView.test.js`（beforeRouteLeave 四分支）
- 场景「locale 成对」→ `scripts/check-locale-sync.js` CI Gate 7
