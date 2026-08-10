// nx.json — Nx affected 测试选择 + 任务缓存（ci-hardening M7 模板）
// 用法：workspaces monorepo 根目录；占位符由 apply-ci-hardening.js 渲染或手动替换。
// 配套根 scripts（package.json）：
//   "test:affected": "nx affected -t test --base={{DEFAULT_BRANCH}} --parallel=1"
//   "test:all": "nx run-many -t test --all --parallel=1"
// 注意：--parallel=1 是确定性套件硬要求（nx 默认跨项目并行会抖动时序敏感测试）。
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "defaultBase": "{{DEFAULT_BRANCH}}",
  "targetDefaults": {
    "test": {
      "cache": true,
      "inputs": ["default", "^default", "{workspaceRoot}/{{LOCKFILE}}"]
    }
  }
}
