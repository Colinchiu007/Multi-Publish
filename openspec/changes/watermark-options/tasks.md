# Tasks: 水印修复与选项扩展

## 1. 测试先行（TDD）
- [x] 1.1 story2video-compose-engine.test.js：bottom-right 坐标含 y=h-text_h-20、center 含 y=(h-text_h)/2、四角表达式（测试文件: story2video-compose-engine.test.js）
- [x] 1.2 moving 输出确定性表达式（sin/cos、无 random()、无逗号、t=0 居中）（同上）
- [x] 1.3 透明度/字号边界：opacity 0.1-1.0、fontSize 10-96、非法输入 clamp/fallback 语义（同上）
- [x] 1.4 story2video-text-config.test.js：position 白名单 fail-closed + 合法枚举透传 + opacity/fontSize 越界拒绝

## 2. 实现
- [x] 2.1 compose engine：修复坐标 + 新增 moving 位置
- [x] 2.2 normalizer：WATERMARK_POSITIONS 白名单 + enumValue 校验
- [x] 2.3 CreateView.vue：水印区三个下拉 + 恢复吸附 normalizeS2VWatermarkOptions
- [x] 2.4 locales zh/en 成对新增 create.story2video.watermark.*

## 3. 验证
- [x] 3.1 vitest：story2video-compose-engine.test.js + story2video-text-config.test.js + CreateView.test.js 通过
- [x] 3.2 真实 ffmpeg 渲染回归：bottom-right / center / moving 各渲染一帧，水印可见且位置正确
- [x] 3.3 locale 同步检查（CI Gate 7）：zh/en 键成对

## 4. 门禁
- [x] 4.1 QM-1 electron-builder 打包验证通过
- [x] 4.2 双模型审查（antigravity + claude reviewer）Critical 清零，结果写入 review.md（降级记录：antigravity 区域不可用 / claude 超时停止，主代理自审替代）

## 5. 文档
- [x] 5.1 01-docs/PRD-video-creation.md 水印章节（契约/校验/流程/交互/提示文案）
- [x] 5.2 01-docs/product-manual.md 使用说明
- [x] 5.3 01-docs/learnings.md 坐标 bug 复盘 + 逃逸分析
- [x] 5.4 CHANGELOG.md
- [x] 5.5 .quality-gates.md 自检清单

## 6. 收尾
- [ ] 6.1 三同步归档（openspec archive + CCG task 归档 + learnings）同一 commit
- [ ] 6.2 推送 codex/watermark-options + PR squash 合并回 main，核对 CI
