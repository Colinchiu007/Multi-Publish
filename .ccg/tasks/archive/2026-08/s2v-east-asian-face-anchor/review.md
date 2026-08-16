# 双模型审查记录：s2v-east-asian-face-anchor

## 审查方式
- 并行发起 antigravity + claude reviewer（reviewer.md 角色），审查 worktree 未提交 diff（9 文件 +345/-5）。
- **antigravity 降级**：`Error: Eligibility check failed: Your current account is not eligible for Antigravity, because it is not currently available in your location.`（区域不可用，与 T0a 分析阶段同因），未产出审查意见，降级记录。
- **claude 完成**：独立执行 git diff + 自行运行三个定向 vitest 文件（166 passed 复验）后输出报告。

## Claude 审查结论（修复前）
- 整体方向正确：正锚进 seed/contextBlock 是主修复手段；C1 era 门控、W1 关键词收敛、W4 场景守卫、W5 按 index 解析均落地。
- 结论：**Request changes**。

### Critical
- **C1 [story-context-engine.js buildGlobalNegativeAnchors / resolveAppearanceAnchor] 无文化命中的非东亚古装剧被强制东亚化**：`!WESTERN_CULTURES.has('')` 恒真，任何 strong-ancient 无文化故事都会注入西方面孔负面锚；`eastAsianCue` 的 genre=历史 分支被「古代」即可触发、`EAST_ASIAN_CUE_TERMS` 含宫殿/马车等非东亚专属词。实证：`古代希腊…宫殿…马车`、`古代维京…`、`古代玛雅…` 均被注入东亚正锚 + 西方面孔负面锚，与代码 W2 注释自述意图相悖（新引入回归）。

### Warning
- **W1 [asset-generator.js → adapters] negative_prompt 实际只到达 local-diffusion**：flux/openai-image/grok-image/imagen/recraft/minimax-image 按已知键构造载荷静默丢弃；CHANGELOG/learnings「透传出图」表述对云厂商是 no-op。建议文档如实表述（正锚为全 provider 主修复手段）。
- **W2 [story2video-stages.js resolveSceneNegativePrompt] 场景无锚时丢弃 stage.options.negative_prompt**：与 optimize 请求语义不一致，用户配置只在场景有锚时才生效。

### Info
- I1 sceneNegativeAnchorsOf 按数组下标取锚，依赖 1:1 对齐（W5 已覆盖回退分支），建议注释明示。
- I2 W4 子串守卫对「长安街头的胡商」整场景失去人物约束，属关键词级设计取舍，建议 learnings 记录。
- I3 正锚不受 includeNegativeAnchors 开关控制，建议显式写明。
- I4 新增用例缺「非东亚古装剧反向」用例（C1 漏网原因）。

## 修复与复核
- **C1 修复**：`buildGlobalNegativeAnchors` 增参 `eastAsianCue`，门控改为 `ancient && strongEra && !WESTERN && (EAST_ASIAN_CULTURES.has(culture) || eastAsianCue)`；`eastAsianCue` 的 genre 分支与术语分支统一过 W4 守卫；`EAST_ASIAN_CUE_TERMS` 裁掉宫殿/将军/马车/轿子/油灯/烛台（非东亚专属）；`NON_EA_SCENE_CUE_TERMS` 增加希腊/雅典/斯巴达/维京/玛雅/北欧。
- **W1 修复**：CHANGELOG/learnings 改为「透传至 adapter 层：local-diffusion 消费，云厂商 adapter 忽略未知键，正锚经最终英文提示词到达全部 provider（主修复手段）」。
- **W2 修复**：`resolveSceneNegativePrompt` 无场景锚但有 stage 配置时仍透传 base；新增用例断言 `negative_prompt==='水印'`。
- **I1/I2/I3**：代码注释/learnings 记录（1:1 前置条件、W4 误伤边界、正锚无开关）。
- **I4**：新增 3 个反向用例（古希腊/维京/玛雅 → 无正锚无面孔负面锚）+ 1 个正向对照（武林/江湖 → 仍锚定）。

## 复核验证
- 修复后三文件定向：**170 passed**（story-context-engine 49 / story2video-stages 106 / asset-generator 15）。
- 与审查者同款实证冒烟（node 直调模块）：希腊/维京/玛雅 → culture=''、eastAsianCue=false、faceNeg=[]、无东亚锚；武林 → cue=true、faceNeg 全 5 项、有东亚锚；朱蒙剧本 → culture=朝鲜·东北亚古国、有东亚锚、无面孔负面锚（mixed 弱信号，C1 符合预期）。
- `node --check` 三个实现文件通过；`git diff --check` 通过。
- 结论：**通过，可提交**。
