## ADDED Requirements

### Requirement: 渲染端用户可见文案单一事实源
用户可见文案（错误、警告、通知、提示、状态、引导）SHALL 只由渲染端 locale 资源（`locales/zh.js` + `en.js`）持有；服务层/主进程 SHALL 只返回稳定机器码（如 `AUTH_REQUIRED`、`bgm_skipped`），不得作为人类可读文案的唯一载体下发。渲染端组件与模块 SHALL NOT 额外持有与 locale 资源重复的 zh/en 文案副本。

#### Scenario: 服务层只下发机器码
- **WHEN** 主进程/服务层返回某个用户可见提示
- **THEN** 返回体携带稳定机器码，人类可读文案由渲染端按机器码 + 当前语言本地化输出

#### Scenario: 新增文案必须进 locale 资源
- **WHEN** 渲染端新增任何用户可见文案
- **THEN** 文案以 zh/en 成对形式加入 locale 资源，且通过 key 引用，不得在组件或模块内散落硬编码字符串
