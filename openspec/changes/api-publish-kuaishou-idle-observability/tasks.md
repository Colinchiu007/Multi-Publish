## 1. 观测器模块（TDD 先行）

- [ ] 1.1 先写 `packages/api-publish-engine/test/degrade-observatory.test.js`（假实现即红）：`record` 聚合计数（attempts/successes/failures/degraded/stopped）、`totalApiMs`/`avgApiMs`/`maxApiMs`、`reasonCodes` 分布、按平台分组；空聚合不抛错；每平台事件环形上限（默认 50）；`clock` 注入；`windowMs` 与 `insufficientSample` 门槛（默认 minAttempts=20、window≥7d）；`summary()` 不生成任何「建议回拨/保留」文本
- [ ] 1.2 落盘契约测试：`persistPath` 注入 `os.tmpdir()` 自建路径；写 `*.tmp` + `renameSync` 原子替换；按 `process.pid` 分区合并（读旧文件只覆盖本 pid，他 pid 保留）；写失败（目录不存在/权限拒绝）→ 首次 `logger.warn` 一次后静默、`record` 不抛、计数仍生效；禁止读取被 Git 忽略的构建残留目录
- [ ] 1.3 实现 `src/publish/core/degrade-observatory.js`（叶子模块，不 require `../index` / `../api-router`），使 1.1/1.2 全绿；字段白名单：不写 accountId/cookie 派生串

## 2. runner 埋点（不改变路由语义）

- [ ] 2.1 扩展 `test/publish-mode-runner.test.js`：注入假 observatory + 虚拟 clock，断言四类出口的事件形态——API 成功（`degraded=false`、outcome=success）、api-then-dom 失败降级（`degraded=true`、apiMs 为尝试耗时）、风控/登录停报（`stopped=true` 且不计入 degraded）、`apiPublish` 抛异常仍计时并记录；dom-only 路径断言零 API 事件
- [ ] 2.2 fail-open 回归：未注入 observatory 时行为与既有断言完全一致；observatory 抛异常时发布结果（`success`/`track`/`reasonCode`）不变
- [ ] 2.3 实现 `publish-mode-runner.js` 计时与事件投递（`deps.observatory`、`deps.clock`），跑 2.1/2.2 与既有 §5.2 全量用例

## 3. 服务装配与对外导出

- [ ] 3.1 扩展 `test/publish-service.test.js`：`createPublishService` 接受注入 observatory、缺省时自建单例；runner 收到同一实例（跨调用累计，服务级单例语义）
- [ ] 3.2 `src/index.js` 装配进程内单例并导出 `getDegradeSummary()` / `getDegradeObservatory()`；persistPath 走运行时数据目录且可被环境变量/参数覆盖；`test/index-exports.test.js` 补导出断言（导出为函数、空进程调用不抛错）

## 4. 门禁与产物验证

- [ ] 4.1 引擎全量：`cd packages/api-publish-engine && node scripts/run-tests.js` EXIT=0（含新增文件被 run-tests 收集）
- [ ] 4.2 相邻回归：`publish-mode-config.test.js` 必须仍断言 kuaishou `publishMode: api-then-dom`（本波禁止改配置）；`publish-governance` / `risk-suspender` 全绿
- [ ] 4.3 QM-1 打包三件套：`pnpm exec electron-builder --win --dir --publish never` → asar 内含 `degrade-observatory`、`require('@multi-publish/api-publish-engine')` 链通、exe 10s 存活（先跑 `node scripts/verify-worktree-deps.js`）
- [ ] 4.4 安全与规范自检：无硬编码密钥、无新依赖、观测字段不含 cookie/正文（对照 log-redact 口径）

## 5. 文档与收口

- [ ] 5.1 CHANGELOG 条目（feat(publish): api-then-dom 空转降级结构化观测）+ `.quality-gates.md` 执行记录（远程同步行按实际状态登记或回填）
- [ ] 5.2 `01-docs/rpa-api-publish/多账号API发布技术方案-v2.md` 补「空转成本观测」小节：说明数据口径与「样本不足不得改配置」纪律；PRD F12/§13.6 追加观测入口一句
- [ ] 5.3 `npx openspec validate api-publish-kuaishou-idle-observability --strict` 通过 → PR + CI 全绿合并
- [ ] 5.4 归档（实现验收后）：`openspec archive` 生成主规格 `api-publish-degrade-observability`（Purpose ≥50 字符，不留 TBD）

## 6. 本波外（明确不做）

- [ ] 6.1 读取入口 UI/IPC（诊断中心/OPS 展示 `getDegradeSummary()`）——另立小波
- [ ] 6.2 依据观测数据决定是否回拨 kuaishou `publishMode: dom-only`——须样本过门槛后独立成波，并翻转 `publish-mode-config.test.js` 断言
- [ ] 6.3 「借浏览器传输」API 轨方案——用户裁决暂不立项，重启须新立 change 并满足已归档「止步裁决记录」双前置
