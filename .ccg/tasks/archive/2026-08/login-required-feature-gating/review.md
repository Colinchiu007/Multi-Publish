# Review — login-required-feature-gating

## 审查方式（降级说明）
CCG 规范 L+ 高风险应双模型审查。antigravity 区域不可用、claude（codeagent-wrapper）多轮探测无输出/exit 1，按机制硬化规则降级主代理自审（证据同前几轮）。

## 审查结论
🔴 CRITICAL：0　🟠 MAJOR：0　🟢 MINOR：见下

## 逐项核对
1. 目标操作登录门禁：模型写操作（上轮）+ 发布历史/队列/进度、流水线写、视频处理/渲染、Story2Video 写全部 authenticated（requiredLevelForChannel 测试锁定，防回归为 public）。
2. 只读/设备本地通道保持 public（pipeline:list/get/history、story2video:list/get、render:status）——离线可用语义未破坏。
3. feature 机制：LOGIN_ONLY_FEATURE_MAP（登录即可、不强制服务端下发，防锁死）vs CHANNEL_FEATURE_MAP（cloud_publish 严格权益，服务端权威）。一致性测试断言 LOGIN_ONLY 通道 authenticated + requiredFeatureForChannel null。
4. 双层强制：preload（未登录抛 LicensePermissionError）+ 主进程（AUTH_ERROR）。withSenderCheck 覆盖写操作。
5. 文档：PRD §7.4 详版 + ACCESS-CONTROL-MATRIX.md（通道矩阵/feature 映射/数据校验/交互/提示文字/验收标准）+ CHANGELOG。
6. 测试：electron/ipc-handlers + preload 全量 735 通过；license-access-control.test.js 新增 3 用例、access-control.test.js 新增 2 用例。
7. 记忆：ad-hoc note 已写（登录门禁矩阵 + dev-only 明文 Key 教训）。

## MINOR（非阻塞）
- 未登录写操作提示为「当前许可证无权访问 model-provider:xxx」，可后续优化为「请先登录」。
- e2e 若在真实未打包未登录环境调用受限写操作会被拒（ipc-mock 环境不受影响），CI 需预置登录态。
- LOGIN_ONLY_FEATURE_MAP 为机制预留，未来服务端下发 feature 时需同步回归测试。
