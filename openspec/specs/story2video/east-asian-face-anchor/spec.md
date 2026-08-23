# story2video/east-asian-face-anchor Specification

## Purpose
Story2Video 场景出图的人物外貌保真：识别古代中国/朝鲜题材（含东北亚古国文化语境）并注入东亚人物外貌正锚与面孔负面锚，把 negative_prompt 透传到出图 Provider，防止古代东亚题材生成西方面孔。

## Requirements

### R1 东北亚古国文化识别
`story-context-rules.json` 的 culture 规则必须识别古国专属词 高句丽/扶余/夫余/卒本川/沃沮/朱蒙，输出文化标签「朝鲜·东北亚古国」与可选地域（卒本川/五女山城/桓仁/辽东）。识别结果参与 anchors、summary 与锚点门控。关键词不得收录有活跃现代语义的词（百济/新罗/鸭绿江/桓仁/五女山），避免现代文本（百济神州/新罗免税店/鸭绿江断桥）误命中文化。

#### Scenario: 古国专属词命中文化标签
- **WHEN** 剧本含 高句丽/朱蒙/卒本川/沃沮/扶余 等古国专属词
- **THEN** culture 规则输出「朝鲜·东北亚古国」标签与可选地域（卒本川/五女山城/桓仁/辽东），识别结果参与 anchors、summary 与锚点门控

#### Scenario: 活跃现代语义词不误命中
- **WHEN** 文本含 百济神州/新罗免税店/鸭绿江断桥 等活跃现代语义词
- **THEN** 不命中「朝鲜·东北亚古国」文化条目，culture 标签不输出

### R2 人物外貌正锚
scene_context 引擎必须为「东亚文化（中国/日本/韩国/朝鲜·东北亚古国）」生成人物外貌正锚「东亚人面孔、黑发、黄皮肤、深色瞳」，并注入：
- `imagePromptSeed`（buildDomainSeed 输出）
- 逐场景上下文块（buildSceneContextBlock 输出）
非欧美文化（印度/阿拉伯/埃及等）使用当地民族面孔表述；欧洲/美国文化绝不注入东亚锚。无文化命中的「strong ancient」场景仅当存在东亚意象线索（genre∈历史/武侠/仙侠/宫廷，或全文明皇/剑客/朝廷/城墙/科举/江湖/武林/宫殿/将军/丝绸之路/马车/轿子/油灯/烛台命中且无非东亚人物意象）时默认东亚锚，防止古希腊/波斯/维京/玛雅等无文化命中的古史被强制东亚化。任一场景文本含非东亚人物意象（胡人/波斯/粟特/大食/色目/金发/蓝眼/西方使者/美国/美军/欧洲/罗马/伦敦/巴黎/白种）时，该场景跳过正锚并移除面孔负面锚。

#### Scenario: 东亚文化注入东亚面孔正锚
- **WHEN** 场景文化为 中国/日本/韩国/朝鲜·东北亚古国
- **THEN** `imagePromptSeed` 与逐场景上下文块包含「东亚人面孔、黑发、黄皮肤、深色瞳」

#### Scenario: 非欧美文化使用当地民族面孔表述
- **WHEN** 场景文化为 印度/阿拉伯/埃及 等非欧美文化
- **THEN** 注入当地民族面孔表述而非东亚锚

#### Scenario: 欧洲/美国不注入东亚锚
- **WHEN** 场景文化为欧洲/美国
- **THEN** 绝不注入东亚锚

#### Scenario: strong ancient 无文化命中需东亚意象线索
- **WHEN** 无文化命中、era 为 strong ancient 且无非东亚人物意象
- **THEN** 仅当 genre∈历史/武侠/仙侠/宫廷或东亚意象词（皇/剑客/朝廷/城墙/科举/江湖/武林/宫殿/将军/丝绸之路/马车/轿子/油灯/烛台等）命中时默认东亚锚；含胡人/波斯/维京/玛雅等非东亚人物意象时跳过正锚

### R3 面孔负面锚
`negativeAnchors` 必须包含面孔排除项（西方面孔/高鼻深目/金发/蓝眼/欧式五官）当且仅当：`era=ancient` 且强信号（朝代命中或多独立信号）。文化命中不覆盖此门（C1：高句丽识别但 era=mixed 弱信号时不注入面孔负面锚，防朝鲜战争/鸭绿江等含西方角色的现代题材误伤）；欧洲/美国文化、modern 时代一律不注入。非东亚意象场景移除面孔负面锚（见 R2 守卫）。

#### Scenario: ancient 强信号注入面孔负面锚
- **WHEN** `era=ancient` 且朝代命中或多独立信号
- **THEN** `negativeAnchors` 包含 西方面孔/高鼻深目/金发/蓝眼/欧式五官

#### Scenario: 弱信号文化命中不注入面孔负面锚
- **WHEN** 高句丽文化识别命中但 `era=mixed` 弱信号（如朝鲜战争/鸭绿江题材）
- **THEN** 不注入面孔负面锚，避免含西方角色的现代题材误伤

#### Scenario: 欧洲/美国与现代时代不注入
- **WHEN** 场景为欧洲/美国文化或 modern 时代
- **THEN** 一律不注入面孔负面锚

#### Scenario: 非东亚人物意象移除负面锚
- **WHEN** 场景文本含 胡人/波斯/粟特/大食/色目/金发/蓝眼/西方使者/美国/美军/欧洲/罗马/伦敦/巴黎/白种 等非东亚人物意象
- **THEN** 移除面孔负面锚并跳过正锚

### R4 出图 negative_prompt 透传
generate_assets（manual 与 auto 路径）出图调用必须把 `stage.options.negative_prompt` 与场景 `negativeAnchors` 合并（mergeNegativePrompt，上限 500）后透传给 `assetGenerator.generateImage` 与 python `generate_image` 载荷。Provider 不支持时忽略未知键，禁止 422 或拒绝。

#### Scenario: manual/auto 双路径透传
- **WHEN** generate_assets manual 或 auto 路径出图且 `stage.options.negative_prompt` 或场景 `negativeAnchors` 非空
- **THEN** 合并（上限 500）后透传给 `assetGenerator.generateImage` 与 python `generate_image` 载荷

#### Scenario: Provider 不支持时忽略未知键
- **WHEN** 出图 Provider 接口不识别 `negative_prompt`
- **THEN** 忽略未知键，不返回 422、不拒绝请求

### R5 回归护栏
现有 唐代全文+老妇人、现代都市、混合时代、空文本 等用例行为不得回归；欧洲/美国/现代场景不得产生东亚锚与面孔负面锚。

#### Scenario: 既有用例行为不回归
- **WHEN** 运行 唐代全文+老妇人、现代都市、混合时代、空文本 等既有用例
- **THEN** 行为与合并前一致，无回归

#### Scenario: 非东亚场景无东亚锚
- **WHEN** 场景为欧洲/美国文化或现代题材
- **THEN** 不产生东亚锚与面孔负面锚
