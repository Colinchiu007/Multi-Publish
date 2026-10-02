# publish-frequency-control — 任务清单

## 1. 频率策略单一真源（TDD）

- [x] 1.1 新建 `packages/shared-utils/src/publish-frequency-policy.js`：15 平台两档表 +
  基线最严档 + `MP_PUBLISH_MIN_INTERVAL_MS` / `MP_PUBLISH_PLATFORM_MIN_INTERVAL_MS` 覆盖 +
  非法值回落并出声 + 纯函数 `resolveIntervals(platform, env)`
- [x] 1.2 `packages/shared-utils/tests/publish-frequency-policy.test.js`：
  15 平台全覆盖、未知平台回落基线（不得为 0）、`0` = 显式关闭、非法值回落 + warn 计数、
  环境变量覆盖优先级
- [x] 1.3 从 `packages/shared-utils/src/index.js` 与 `index.d.ts` 导出

## 2. Guard 扩展为双档 + 缺席也受控

- [x] 2.1 `publish-interval-guard.js` 新增 `check(platform, accountId, now)` 返回
  `{allowed, remainingMs, bucket}`；保留 `canPublish`/`recordPublish`/`getRemainingWait`
  既有签名（60+ 现存测试不得改）
- [x] 2.2 平台档桶键 `${platform}:*`；`accountId` 缺席时账号档跳过、平台档仍生效
- [x] 2.3 `record` 一次写两档；间隔值由策略模块按平台解析（不再构造期钉死单一 minInterval）
- [x] 2.4 测试：两档各自独立命中、两档同时命中取较大等待、缺席账号仍被平台档挡住、
  关闭档（0）恒放行

## 3. TaskQueue：记账前移 + 装配语义

- [x] 3.1 `task-queue.js` `_executeTask`：两档检查 → 阻塞则重排返回 →
  通过则**提交前**记账 → 再 submit；移除成功路径里的记账
- [x] 3.2 等待回退语义核对（`status:'pending'`、`startedAt:null`、不消耗 `retriesLeft`、
  句柄进 `_pendingTimers` + `unref`、`shutdown` 清理、取消再检查）
- [x] 3.3 `publish:blocked` 载荷补 `bucket`（account/platform）以便现场归因

## 4. 三处断链修复

- [x] 4.1 `container.setup.js:324` 工厂内注入 `publishIntervalGuard`（排在 `options.taskQueue`
  展开之后，不允许被覆盖成 undefined）
- [x] 4.2 `container.setup.js:332` guard 注册改为消费策略模块（去掉构造期硬编码 minInterval）
- [x] 4.3 `phase3-services.js:95` 删除死变量 `_publishIntervalGuard`，并同步该文件的
  JSDoc「phase3 负责 publishIntervalGuard」表述
- [x] 4.4 `phase3-services.test.js:31` 的 `publishIntervalGuard` 空对象夹具随之清理

## 5. 回归锁 + 反证（核心，防"装饰性接线"再犯）

- [x] 5.1 **装配锁**：新建 `apps/desktop/electron/core/taskQueue-frequency-guard.test.js`，
  以生产方式 `createContainer()`（不带参数）构建，断言 `taskQueue` 内部守卫非 null
  且与 `container.get('publishIntervalGuard')` 同一实例
- [x] 5.2 **行为锁**：经守卫的队列真的挡住第二次提交 / 到点放行 /
  超时任务仍占窗口 / 失败重试仍等窗口
- [x] 5.3 **反证（必须实跑并记录红条数）**：
  (a) 摘掉 `container.setup.js` 的注入 ⇒ 装配锁必须变红；
  (b) 把记账挪回成功路径之后 ⇒ 超时占窗口用例必须变红；
  (c) 让 `accountId` 缺席跳过全部检查 ⇒ 缺席仍受控用例必须变红；
  (d) 把守卫本身改成 no-op ⇒ 行为锁必须变红
- [x] 5.4 新测试文件按 `check-unwired-tests.js` 口径接进 `.github/workflows/quality-gate.yml`
  （写全相对路径；「接进 CI 了」≠「对本 PR 跑」≠「红了拦得住」，需核对落点取得到证据）

## 6. 门禁与交付

- [x] 6.1 shared-utils + apps/desktop 相关测试全量；`verify-worktree-deps.js`
- [x] 6.2 QM-1 本地打包验证（改了 `apps/desktop/electron/`）
- [ ] 6.3 QM-6 双模型外部评审（M+ 强制；模型名真源 `~/.claude/.ccg/config.toml`）
- [x] 6.4 PRD `01-docs/PRD-PUBLISH-FREQUENCY-CONTROL-2026-10-02.md`
  （须含：默认值属工程保守估计而非平台规则、乐观记账的代价、不含设备级串行）
- [x] 6.5 CHANGELOG 收口（注意 CRLF 基线，禁止整文件统一行尾）
- [ ] 6.6 `.quality-gates.md` 执行记录 + 账本登记（docs-only 判定不适用，本 PR 是混合 PR）
- [ ] 6.7 PR → CI → 合并 → 归档三同步
