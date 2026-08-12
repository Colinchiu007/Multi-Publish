## ADDED Requirements

### Requirement: 首页文案全量 i18n
Home.vue 的全部用户可见文案 SHALL 纳入 vue-i18n `home` 命名空间（zh/en 成对），模板与脚本不得残留硬编码中文文案（注释与平台数据源除外）。

#### Scenario: 模板文案
- **WHEN** 渲染 Home.vue（任意语言）
- **THEN** 副标题、快捷操作、统计标签、区块标题、空态、无标题等均经 `t('home.*')` 输出，zh/en 有对应文案

#### Scenario: 时段问候与状态
- **WHEN** 问候语/状态标签按当前时间与任务状态计算
- **THEN** 通过 key 映射输出当前语言文案（zh：夜深了/早上好…；en：late night/good morning…），状态 zh：成功/失败/等待中…；en：Succeeded/Failed/Pending…

#### Scenario: 平台 fallback 标签
- **WHEN** platformStore 为空时展示内置平台标签
- **THEN** 标签经 `home.platforms.<id>` 输出当前语言（zh 保持中文名，en 用通用英文名）

### Requirement: 时间格式化随语言
`formatTime` SHALL 按当前应用语言使用 `zh-CN` / `en-US` 区域格式。

#### Scenario: 语言切换后时间格式
- **WHEN** 应用语言为 zh / en
- **THEN** `formatTime` 分别使用 zh-CN / en-US 区域设置

### Requirement: 场景-测试映射
以上场景 SHALL 由 Home.test.js 覆盖：mount 安装 vue-i18n 插件；zh 断言保持原文；至少 1 条 en 断言验证英文输出；时段问候正则覆盖 zh/en。

#### Scenario: 回归断言
- **WHEN** Home.test.js 运行
- **THEN** zh 断言原文、en 断言英文文案、时间区域格式断言均通过
