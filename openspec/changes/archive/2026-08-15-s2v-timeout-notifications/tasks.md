## 1. 动态 ffmpeg 预算（TDD）

- [x] 1.1 在 `story2video-compose-engine.test.js` 增加预算 helper 的短片下限、50 分钟、非法时长与硬上限回归（映射：动态缩放四个 Scenario）
- [x] 1.2 在 compose 调用链测试中断言 concat/旁白/BGM/WebM/输出校验接收对应媒体时长（映射：各阶段使用对应媒体时长两个 Scenario）
- [x] 1.3 实现统一有界预算 helper，替换固定 60s/120s/180s，并给 xfade 预算增加 6 小时上限

## 2. Story2Video 通知（TDD）

- [x] 2.1 在通知测试中增加中英文总时长、单段旁白、合成 timeout/ETIMEDOUT 映射及未知错误脱敏回归（映射：通知四个 Scenario）
- [x] 2.2 新增三个稳定通知 key、受限参数归一化和错误正则；在 `zh.js` / `en.js` 成对增加原因与建议文案

## 3. 文档与预防措施

- [x] 3.1 更新 `01-docs/PRD.md` 与 `01-docs/PRD-video-creation.md`，将两个已知限制改为已交付合同
- [x] 3.2 更新 `CHANGELOG.md`、`01-docs/learnings.md`、`.quality-gates.md`，记录 QM-5、测试映射与交付证据
- [x] 3.3 如规则具有通用价值，回馈 `.ccg/spec` 的动态媒体预算/错误映射强制点

## 4. 验证、审查与交付

- [x] 4.1 运行定向 Vitest、locale pair/CJK、Vite build 与 `openspec validate --strict`
- [x] 4.2 运行依赖解析门禁与 Windows Electron 完整打包，验证产物启动/关键 stderr
- [x] 4.3 完成双模型代码审查；修复 Critical/Warning 并写入 CCG `review.md`
- [x] 4.4 完成 OpenSpec/CCG/质量节拍归档，提交、推送 `codex/s2v-timeout-notifications` 并创建 PR，记录 `remoteStatus=pr_open`（PR #847；OpenSpec change 待合并后归档）
