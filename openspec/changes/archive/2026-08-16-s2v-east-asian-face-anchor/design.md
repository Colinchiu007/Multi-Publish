# Design

## 决策 1：锚点走代码常量，不扩 rules schema
人物外貌/面孔负面锚是「文化→外观」的固定映射，作为引擎常量（EAST_ASIAN_CULTURES / WESTERN_CULTURES / 锚文本），避免外部 rules 覆盖文件丢失新字段导致校验失败。规则 JSON 只新增 culture 条目（兼容现有 schema）。

## 决策 2：正锚文化优先，负面锚 ancient+strong
- 人物外貌正锚：文化命中（中国/日本/韩国/朝鲜·东北亚古国）即启用，不依赖 era（用户朱蒙剧本 era=mixed 弱信号仍出东亚锚 = 主修复杠杆）；欧洲/美国、含非东亚人物意象场景不启用。
- 面孔负面锚（C1，双模型分析修正）：`era=ancient` 且 strong 才注入；文化命中不覆盖此门。防「高句丽遗址+手机合影」之类 culture 命中但 mixed 弱信号、或现代题材误伤西方角色。`extractStoryContext` 输出附加 `eraStrong` 供门控。
- 无文化 strong ancient 需东亚意象线索（W2）：genre 属 历史/武侠/仙侠/宫廷，或东亚术语命中且全文无非东亚人物意象——防止古希腊/波斯/维京/玛雅被强制东亚化。

## 决策 3：注入点
- `buildDomainSeed`：seed 末尾追加「人物形象：锚」→ optimize LLM 会把它写进最终英文提示词（主杠杆）。
- `buildSceneContextBlock`：contextBlock 追加「人物形象：锚」→ 兜底/降级路径仍生效；场景文本命中非东亚人物意象（胡人/波斯/粟特/大食/色目/金发/蓝眼/西方使者/美国/美军/欧洲/罗马/伦敦/巴黎/白种）时跳过正锚并移除该场景面孔负面锚（W4）。
- `buildGlobalNegativeAnchors`：按决策 2 门控追加面孔负面锚 → 流入 `scene.negativeAnchors` → optimize negative_prompt 与出图 negative_prompt。

## 决策 4：出图透传
manual（buildManualSceneCandidates）与 auto 两条出图路径共用模式：按场景索引 resolve `scene.negativeAnchors`（不从 optimize 条目取，覆盖 skipped_optimize/too_short/llm_rejected 三种回退分支，W5），与 `stage.options.negative_prompt` 经 `mergeNegativePrompt` 合并（≤500），透传 `assetGenerator.generateImage` opts 与 `callPythonSkill('generate_image')` 载荷。`asset-generator.js _tryProviderImage` 将 `opts.negative_prompt` 传入 `aiGenerator.generate('image', provider, opts)`。桌面/py 侧不消费 unknown 键的 adapter 忽略之（W3：桌面 FLUX/BFL 按已知键构造 body，`negative_prompt` 被丢弃——不加转发以免未经 fal.ai 验收的字段触发 422，文档标注桌面 FLUX 为 ignore-only；受益者：桌面/端 local-diffusion 等显式消费 `negative_prompt` 的 adapter）。

## 风险与缓解
- 关键词误伤（朝鲜/辽东/百济/新罗/鸭绿江 出现在现代文本）：culture 关键词只收录古国专属词（朱蒙/高句丽/扶余/夫余/卒本川/沃沮），地域词（卒本川/五女山城/桓仁/辽东）仅作 region 标签，维持 era 判定独立。
- contextBlock 超长：锚文本进入既有 truncateBySentence 截断路径。
- negative_prompt 对不支持 provider：仅新增字段，provider 忽略；本地 Diffusion 等显式消费方受益。
- 面孔负面锚门控过宽会误伤含西方角色的题材：C1 门（ancient+strong）+ W4 场景守卫双保险。

## 风险与缓解
- 关键词误伤（朝鲜/辽东 出现在现代文本）：只收录古国专属词（朱蒙/高句丽/扶余/卒本川/五女山城等），维持 era 判定独立。
- contextBlock 超长：锚文本进入既有 truncateBySentence 截断路径。
- negative_prompt 对不支持 provider：仅新增字段，provider 忽略；本地/FLUX 等支持者受益。
