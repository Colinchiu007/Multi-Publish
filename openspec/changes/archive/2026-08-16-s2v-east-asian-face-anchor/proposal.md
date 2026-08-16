# 修复 Story2Video 古代东亚故事生成图片出现西方面孔

## What & Why

用户反馈：通过 story2video 流水线（故事讲述/图片轮播）生成「古代中国和朝鲜（朱蒙·高句丽·扶余·五女山城）」主题视频时，场景图片出现西方人脸。

根因（证据链）：
1. `story-context-rules.json` 文化规则缺东北亚古国关键词（高句丽/扶余/卒本川/五女山），`韩国` 条目仅有现代词，剧本命中不到任何文化/时代锚，`era=mixed`、`dynasty=null`。
2. `story-context-engine.js` 的 `buildDomainSeed` 种子模板与 scene_context 中间层完全没有「人物外貌/人种」维度；负面锚只有背景类（西方现代建筑等），无面孔排除项。
3. optimize（prompt-engine 8013）拿无约束种子自由发挥，生成的英文提示词无任何 East Asian 面孔描述；图片模型默认面孔分布偏向西方人。
4. 出图调用只传 prompt 文本，不透传 negative_prompt（python 侧多个 Provider 已支持）。

## Scope（In）

- scene_context 规则：新增东北亚古国文化条目。
- 人物外貌正锚 + 面孔负面锚（代码常量，不扩 rules schema）。
- imagePromptSeed / 场景上下文块注入锚点。
- 出图（manual + auto 两条路径）negative_prompt 透传。

## Scope（Out）

- 不动 prompt-engine 外部服务模板。
- 不改 UI 文案（无 locales 变更）。
- 不按角色做 NER/外观图谱（超范围）。
