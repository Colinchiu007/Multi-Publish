## 1. L0 门禁测试（i18n.test.js）

- [ ] 1.1 `i18n.test.js` 增加 zh/en 叶子键对称断言（复用 `collectLeaves`，缺键输出缺失路径）
- [ ] 1.2 `i18n.test.js` 增加同 key `{param}` 占位符集合一致性断言
- [ ] 1.3 新增 `src/story2video/story2video-notifications.sync.test.js`：断言 locales 与模块同 key 文案值一致
- [ ] 1.4 运行 `apps/desktop` vitest 定向测试并确认全部通过

## 2. L1 提交配对 + 硬编码扫描（CI）

- [ ] 2.1 新增 `scripts/check-locale-sync.js`：locale diff 成对检查（zh/en 必须同时变更）
- [ ] 2.2 同一脚本实现 renderer CJK 硬编码扫描（豁免注释/数据源白名单，先 Warning 灰度）
- [ ] 2.3 CI workflow 增加 locale 检查 job，挂载 `check-locale-sync.js`（仅 locale 相关路径触发）
- [ ] 2.4 构造「只改 zh.js」提交验证 CI 可复现失败（在临时分支验证后丢弃）

## 3. L2 收敛重复语料源

- [ ] 3.1 确认 `story2video-notifications.js` 38 通知键 + 弹窗按钮 + BGM reason + 历史详情规则全部在 locales 存在且值一致
- [ ] 3.2 迁移模块 `messageFor` 改为 `i18n.global.t(key, params)`，移除模块内 zh/en 文案对象
- [ ] 3.3 更新 `story2video-notifications.test.js` 与依赖该模块的视图测试
- [ ] 3.4 删除 L0-3 重复源校验测试；全量运行 `apps/desktop` 测试套件

## 4. L3 术语词典

- [ ] 4.1 新建 `01-docs/i18n-glossary.md`（zh / en / 机器 ID 三列表，含「全能创作 / Omni Creation / story2video-compose」等现有术语）
- [ ] 4.2 新增词典校验测试：扫描 locales 文案断言词典术语成对出现（机器 ID 绑定术语硬校验，其余告警）
- [ ] 4.3 更新 AGENTS.md 与 `.quality-gates.md`：「修改 locale 文件必须 zh/en 成对提交」条款

## 5. 规范与验收

- [ ] 5.1 更新 `openspec/specs/user-facing-messages/spec.md` 与 `openspec/specs/i18n-content-sync/spec.md`（若已归档则由 sync 流程处理）
- [ ] 5.2 按本 change 验收清单逐项核验：键对称/占位符/重复源/配对/CJK/词典六项门禁全部生效
- [ ] 5.3 更新 PRD §3.2 与 `01-docs/i18n-sync-mechanism.md` 的落地状态标记
