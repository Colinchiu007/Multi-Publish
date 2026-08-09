# Tasks: ci-affected-test-selection

## 1. Nx 引入与项目图核验

- [x] 1.1 根 package.json 添加 `nx` devDependency（锁定版本），根新增 `nx.json`：`targetDefaults`（test 目标沿用各 workspace 现有命令）、`cacheableOperations: ["test"]`、`inputs` 覆盖源码/测试/lockfile/nx 配置
- [x] 1.2 本地核验 `nx show projects` 发现全部 6 个 JS/TS workspace（ai-writer/ai-writer-api/desktop/python-backend 除外/rpa-engine/remotion-composer/shared-utils），推断失败处补显式 targets
- **测试目标**：`nx show projects` 输出包含预期 workspace 集合；桌面 vitest 串行参数不变

## 2. affected 冒烟与基线测量

- [ ] 2.1 临时分支冒烟：`nx affected -t test --base=origin/main`，记录受影响集合与时长；对照全量 `npm run test --workspaces --if-present` 时长
- [ ] 2.2 验证缓存语义：同 head 二次执行命中缓存（输出含命中标记）；改 shared-utils 后 rpa-engine/desktop 重新真实执行
- **测试目标**：affected 集合含传递依赖者；缓存命中/失效行为符合 spec「任务缓存」Requirement

## 3. CI 接入（quality-gate 单测 job）

- [ ] 3.1 quality-gate.yml：`on` 新增 `push`（branches: [main]，同 paths-ignore）；unit-tests job 在 pull_request 事件用 `nx affected -t test --base=origin/main`（先 `git fetch origin main --depth=1`），workflow_dispatch / push main 用 `nx run-many -t test --all`（全量）；保留 Gate 4 watchdog
- [ ] 3.1b 以 MODIFIED delta 更新 ci-quality-gate-parallel「触发去重」Requirement（允许 main push 全量回归，feature 分支仍仅 PR 触发）
- [ ] 3.2 缓存持久化：actions/cache 存取 `.nx/cache`（同 job 与跨 run 复用）
- **测试目标**：PR 事件日志含受影响包清单与缓存命中状态；dispatch 全量；Gate 4 watchdog 契约不被破坏

## 4. 契约测试与本地验证

- [ ] 4.1 workflow-contract.test.js 新增断言：根 package.json 含 nx、nx.json cacheableOperations 含 test、quality-gate unit job 在 pull_request 用 affected 命令、workflow_dispatch 用全量命令
- [ ] 4.2 本地全量验证：YAML 解析 + node --test 契约套件（17→20 项左右）通过
- **测试目标**：契约测试守护 spec 的「受影响测试选择 / 全量回归保留 / 确定性契约保持」场景

## 5. 门禁与交付

- [ ] 5.1 本 PR CI 通过（quality-gate affected 场景实测 + electron/build/visual 既有流程），记录改造前后单测 job 时长
- [ ] 5.2 双模型审查（antigravity + Claude；后端不可用则降级记录）
- [ ] 5.3 合并；归档三同步（openspec archive + CCG task 归档 + learnings）
