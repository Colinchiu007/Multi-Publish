## Tasks

- [x] T0a 双模型分析：antigravity 区域不可用（降级记录），claude 完成 C1-W5 修正建议
- [x] T0b 测试先行：story-context-engine.test.js 新增（高句丽 seed 锚 / 欧洲不锚 / modern 无面孔负面 / strong ancient+东亚意象默认锚 / C1 culture命中+mixed 不出负面锚 / W4 波斯场景守卫 / eraStrong 输出）+ 更新 2 个 seed 黄金用例 → 红（修复前 8 failed）
- [x] T1 story-context-rules.json 新增「朝鲜·东北亚古国」culture 条目（关键词仅 高句丽/扶余/夫余/卒本川/沃沮/朱蒙）
- [x] T2 story-context-engine.js：锚常量 + resolveAppearanceAnchor + eraStrong/eastAsianCue + C1 门控 + W4 守卫 + 注入 seed/contextBlock/negativeAnchors（审查 C1 收紧：无文化 strong ancient 需东亚专属意象线索）
- [x] T3 story2video-stages.test.js 新增出图负向透传用例（manual/auto、assetGenerator/python 两条路径，按 index 从 scene_context resolve）→ 红
- [x] T4 story2video-stages.js auto(imageItemTask)/manual(generateOneImage) 双路径 negative_prompt 合并透传（resolveSceneNegativePrompt；无锚但有 stage 配置仍透传 base）
- [x] T5 asset-generator.test.js 新增 generateImage→_tryProviderImage 透传用例 → 绿
- [x] T6 asset-generator.js _tryProviderImage 透传 opts.negative_prompt
- [x] T7 全绿：三文件 170 passed + node --check + git diff --check
- [x] T8 docs：CHANGELOG.md / 01-docs/learnings.md 复盘条目；双模型审查 → review.md（antigravity 区域不可用降级，claude 完成 C1 修正并复核）
- [ ] T9 提交分支 codex/s2v-east-asian-face-anchor、推远端、PR（含 OpenSpec change）
