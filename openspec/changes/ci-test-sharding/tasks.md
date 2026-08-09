# Tasks: ci-test-sharding

## 1. 分片基础

- [ ] 1.1 根 package.json 新增 `test:desktop:shard` 脚本（透传 `--shard=k/N` 到桌面 vitest）
- [ ] 1.2 本地冒烟：`vitest run --shard=1/2` 与 `--shard=2/2` 各跑通，文件数之和等于全量
- **测试目标**：分片按文件正确切分；进程内串行配置不变

## 2. CI 接入

- [ ] 2.1 quality-gate.yml 新增 `desktop-shards` matrix job（N=2，`strategy.matrix.shard: [1/2, 2/2]`，每 shard 保留 30 分钟 watchdog）
- [ ] 2.2 unit-tests job 命令改为 `nx affected -t test --exclude=@multi-publish/desktop`（full 模式 `nx run-many -t test --all --exclude=@multi-publish/desktop`）
- **测试目标**：桌面由分片 job 承担，unit-tests 只跑非桌面；watchdog 语义保留

## 3. 契约测试

- [ ] 3.1 workflow-contract.test.js 新增断言：desktop-shards job + matrix.shard 存在、run 含 `--shard=`、unit-tests 含 `--exclude=@multi-publish/desktop`、根 package.json 有 test:desktop:shard
- [ ] 3.2 本地全量验证：YAML 解析 + 契约套件通过；vitest 串行配置断言保留
- **测试目标**：spec「契约测试守护」场景

## 4. 门禁交付

- [ ] 4.1 本 PR CI 通过（desktop-shards 两 shard + unit-tests 非桌面 + electron/build/gui/visual 既有流程），记录分片前后桌面套件时长
- [ ] 4.2 双模型审查（antigravity + Claude；后端不可用则降级记录）
- [ ] 4.3 合并；归档三同步（openspec archive + CCG task 归档 + learnings）
