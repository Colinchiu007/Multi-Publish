# plan.md — 实施计划

进度单一来源：openspec/changes/watermark-options/tasks.md（checkbox 唯一真源）。本文件只做执行顺序与门禁摘要。

## 执行顺序
1. TDD：先补测试（compose 坐标/moving/边界 + normalizer 枚举 fail-closed）→ 红
2. 实现 compose engine（坐标修复 + moving）→ 跑测试 → 绿
3. 实现 normalizer 白名单 → 跑测试 → 绿
4. UI（CreateView.vue 三下拉 + 恢复吸附）+ locales 成对 → 跑 CreateView 测试 + locale 同步检查
5. 真实 ffmpeg 渲染回归（bottom-right/center/moving 帧验证）
6. QM-1 打包验证（electron-builder）
7. 双模型审查（变更 >30 行，antigravity + claude 并行）→ review.md → Critical 清零
8. 文档五件套（PRD-video-creation / product-manual / learnings / CHANGELOG / .quality-gates.md）
9. 三同步归档 commit → 推送 → PR squash 合并 main → 核对 CI

## 门禁清单
- [ ] 测试全绿（vitest 相关文件 + CreateView）
- [ ] locale zh/en 键成对
- [ ] QM-1 打包 exit 0
- [ ] 双模型审查 Critical 清零
- [ ] .quality-gates.md 自检完成
- [ ] PR 合并后核对 CI 通过
