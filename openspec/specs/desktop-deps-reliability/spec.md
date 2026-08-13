# desktop-deps-reliability Specification

## Purpose
TBD - created by archiving change desktop-deps-reliability. Update Purpose after archive.
## Requirements
### Requirement: 可复现依赖解析
workspace 依赖声明 SHALL 可被 npm 完整解析，不允许解析到 registry 上不完整存在的版本集。

#### Scenario: remotion 系列重解析成功
- **WHEN** 在仓库根执行 `npm install --package-lock-only --ignore-scripts`
- **THEN** 命令成功退出，remotion 系列解析版本为 `4.0.484`

#### Scenario: 版本集完整性约束
- **WHEN** 修改任一 remotion 相关依赖声明
- **THEN** 声明的版本必须在其全部直接依赖可见的 registry 上存在（如 `@remotion/renderer` 与 `remotion` 同版本）

### Requirement: 关键依赖启动前自检与自愈
桌面开发启动前 SHALL 校验关键原生/平台依赖的完整性与可加载性，缺失时通过旁路补装恢复，不依赖整树 npm install。

#### Scenario: 健康树检查通过
- **WHEN** 执行 `node scripts/ensure-desktop-deps.js --check`
- **THEN** 对完整 node_modules 输出全 OK 且退出码 0

#### Scenario: 缺失依赖自动恢复
- **WHEN** `@ctrl/tinycolor`（或清单内任一包）在 node_modules 中缺失且执行默认 restore 模式
- **THEN** 脚本通过 npm pack 旁路补装目标包并输出 restored 明细，恢复后该包可被 require

#### Scenario: 恢复动作失败不静默
- **WHEN** npm pack 或解包失败
- **THEN** 脚本输出明确错误并返回非零退出码，不破坏既有 node_modules 状态

### Requirement: Vite 优化缓存失效守卫
启动流程 SHALL 检测并失效陈旧的 Vite optimize 缓存，避免 `504 (Outdated Optimize Dep)` 导致的空白页。

#### Scenario: 陈旧缓存被失效
- **WHEN** `apps/desktop/node_modules/.vite/deps` 存在且 `--invalidate-vite-cache` 生效
- **THEN** 该目录被改名（保留可回退），不再被 Vite 使用

