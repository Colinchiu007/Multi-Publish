# Tasks — story2video-history-public-read-channels

## 审计与前置
- [x] 真实根因：license-access-control 默认 authenticated，未登录拒 story2video:list-projects/pipeline:history（code -3）
- [x] OpenSpec change 创建

## 实现
- [x] TDD：license-access-control 测试（两通道 public + 写通道 authenticated + 未登录 handler 放行/拒绝）
- [x] 实现：PUBLIC_CHANNELS 加两通道
- 测试目标：license-access-control.test.js、story2video.test.js（49 用例绿）

## 验证与交付
- [x] 真实 Electron e2e：不弹错 + 本地模式提示条 + 空态（e2e-verify-history7.log）
- [ ] 双模型审查（Claude）
- [ ] 文档：learnings / CHANGELOG / quality-gates
- [ ] 提交 → push → PR → CI → 合并
- [ ] 应用重启验证 + 归档 + 记忆更新
