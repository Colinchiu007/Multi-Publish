## ADDED Requirements

### Requirement: 未登录时本地历史可用
身份服务已启用但当前未登录（无有效 sub）时，视频创作历史记录 SHALL 回退到设备级本地命名空间读取/写入，不得抛「无法识别当前用户」，不得弹出「历史记录暂时无法加载」。

#### Scenario: 未登录打开历史记录
- **WHEN** 身份服务启用且未登录（owner provider 返回 null），用户打开视频创作历史记录
- **THEN** `story2video:list-projects` 返回 code 0 与本地项目列表（可能为空），界面不弹 HISTORY_LOAD_FAILED

#### Scenario: 登录后隔离
- **WHEN** 用户登录（owner provider 返回有效 sub）
- **THEN** 项目按 sub 隔离读写，未登录期间写入的 legacy 数据不混入登录用户空间

### Requirement: 存储不可用仍 fail-closed
store 缺失或不可用时，视频创作项目读写 SHALL 保持 fail-closed（抛错/返回明确错误），不得静默降级。

#### Scenario: store 缺失
- **WHEN** Story2VideoProjectService 无 store
- **THEN** listProjects 抛「Story2Video 项目存储不可用」

### Requirement: 场景-测试映射
本能力每个 WHEN/THEN 场景 SHALL 映射到测试（project-service 单测 + CreateView loadHistory 用例），标注于 change tasks.md。

#### Scenario: 回归保护
- **WHEN** 未登录场景回归
- **THEN** project-service 测试断言 listProjects 不抛且可读写 legacy 空间；CreateView 测试断言不弹 HISTORY_LOAD_FAILED
