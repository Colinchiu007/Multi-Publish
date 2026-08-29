# 实施计划：s2v-pipeline-config-profiles

## Phase 0/1：规格与影响审计

- [x] 核对现有 CreateView 的 `s2vConfig`、legacy 表单、lastOptions watcher、provider/voice 加载链。
- [x] 核对 BGM library、IPC sender/license/preload 白名单模式。
- [x] 建立 OpenSpec change、设计、规格和测试映射；补 proposal 以满足 change 生命周期。

## Phase 2：TDD 增量修复

1. 服务层：让部分损坏索引保留原始字节，list 过滤合法项，create/rename/delete 统一写守卫；补 rename/delete 回归。
2. CreateView：用显式可配置字段白名单构造编排快照；不保存素材、发布和运行时字段。
3. CreateView：引入具名配置应用代际，取消 pending lastOptions timer；应用和异步 voice reload 期间禁止旧 watcher 写回。
4. CreateView：统一 legacy/编排恢复归一化，补 `fps/format/selectedStyle/budgetConfig.mode`、`subtitleEnabled`、`sceneDurationMode` 和 video provider 清理。
5. CreateView：服务端重复名错误进入覆盖态；保存/列表加载期间允许关闭；确认时重校验 pipeline 与目标快照。
6. 测试：每个修复先补/调整失败回归，再运行 focused suite，禁止以放宽断言消除失败。

## Phase 3：文档与质量门禁

- [ ] 同步 PRD、DEVELOPMENT_REPORT、CHANGELOG、i18n glossary、OpenSpec design/spec/tasks。
- [ ] 补 `.quality-gates.md` 本次执行记录、CCG review.md 和最终 remoteStatus。
- [ ] 删除 review-ctx 临时材料，不提交外部模型原始载荷。

## Phase 4：验证与交付

- [ ] focused Vitest 全绿；locale pair/CJK、ESLint、TypeScript、Vite/preload build 全绿。
- [ ] `verify-worktree-deps`、OpenSpec strict validate、Windows electron-builder、ASAR/require、启动 stderr、可见顶层窗口证据。
- [ ] 全量 desktop Vitest 串行并区分本次失败与环境/基线超时。
- [ ] 以固定 diff 并行执行 opencode + Claude review，分类记录 CLI、wrapper 和真实 bounded review 状态。
- [ ] stage 明确路径、commit、push、创建 PR、等待 required CI，使用 `gh pr merge` 实际合并并 fetch 核对 `origin/main` SHA。
- [ ] 远程合并确认后 archive OpenSpec change 和 CCG task，并新增记忆 note。
