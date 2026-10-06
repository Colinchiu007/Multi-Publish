# PRD — Story2Video 竖屏出图画幅断链修复（fix-s2v-image-aspect-adapters，2026-10-06）

> 关联 Bug 报告：项目 ID `mur2tzc8_ru1r`，「视频创作 → 故事讲述」流水线分辨率选 720x1280，
> 成片确为竖屏 720x1280，但**生成的图片是横屏**，合成后画面没充满、两侧黑边。
>
> 修复分支：`fix-s2v-image-aspect-adapters`（隔离 worktree `mp-fix-s2v-image-aspect-adapters`）。
> **前序修复**：[`PRD-STORY2VIDEO-PORTRAIT-IMAGE-ASPECT-2026-10-02.md`](./PRD-STORY2VIDEO-PORTRAIT-IMAGE-ASPECT-2026-10-02.md)（PR #2787）。
>
> ⚠️ **本 PRD 与前序 PRD 的关系（必读）**：同一项目、同一现象，**前序修复未根治**。
> 本 PRD 既是补充，也是对前序 PRD §2.4「供应商矩阵」的事实更正（见 §3）。

---

## 1. 背景与现象

### 1.1 用户可见现象

1. 用户在「视频创作 → 故事讲述」选择输出分辨率 **720x1280（9:16 竖屏）**；
2. 成片 `video.mp4` 尺寸确为 **720x1280 竖屏**（正确）；
3. 成片每个场景画面左右出现**大面积黑色填充带**，主体未充满；
4. 场景图片素材（`segment_XXXX_image.png`）为**横屏/方屏**，与竖屏成片比例不符。

### 1.2 黑边机理（前序 PRD 已论证，此处沿用）

`story2video-compose-engine.js` 的 `buildScaleFilter` 对每张素材执行
`scale=W:H:force_original_aspect_ratio=decrease, pad=W:H:(ow-iw)/2:(oh-ih)/2:color=black`。
比例不符的素材进入竖屏画布时按 decrease 等比缩放后由 pad 补黑。**合成层行为是设计内兜底**，
根因在上游出图。合成层的兜底对「用户自选素材」仍然必要，本次不改。

### 1.3 前序修复为什么没根治

PR #2787（2026-10-02）定位到 `agnes-image.js` 把 API 请求体字段名 `ratio` 误用作入参名，
改为 `aspect_ratio || aspectRatio || ratio` 后**只覆盖了 1 个图片适配器**。
当时该项目的图片 Provider 恰是 agnes，修复生效；但**换一个图片 Provider 就原样复现**。

更深一层的问题是：前序 PRD §2.4 判定 `flux` / `local-diffusion` / `openai-image`
「直接消费 width/height（asset-generator 已传）→ ✓ 正常」——这一条**结论正确**，
但它把「当前这几个恰好正常」当成了「画幅契约已被覆盖」，于是**没有对适配器做穷举**。
真正断链的另外几个适配器（见 §3）被登记成「观察项/不盲改」，其中 `recraft` 甚至因
「上游文档抓取超时」被搁置——而它恰恰是断链者之一。

---

## 2. 目标与非目标

### 2.1 目标

| # | 目标 | 验收口径 |
| --- | --- | --- |
| G1 | 任何输出分辨率（竖/横/方）下，**所有**图片 Provider 都按成片画幅出图 | 行为锁：8 个适配器逐个断言下游请求体为竖/横图 |
| G2 | 画幅契约有**单一真源**，新增适配器不会重蹈「各自发明解析」 | 结构锁：穷举扫描 `generateImage` 适配器目录，漏消费即红 |
| G3 | 上游漏传画幅时**不静默降级** | 流水线层按输出分辨率推导兜底（不再写死 16:9） |
| G4 | 非故事讲述的自动流水线不再有同源缺口 | `startExplainerPipeline` 随分辨率下发画幅 |

### 2.2 非目标

- **不改** compose 引擎的 `decrease + pad` 兜底（对用户自选素材是必要行为）。
- **不改**历史项目已落盘的图片与成片（不追溯重渲染；重新生成场景图片即可获得正确画幅）。
- **不改** locales（无新增用户可见文案，见 §7）。
- **不修** comfyui 的出图比例（尺寸写在 workflow 图里，适配器无生效路径，见 §3.3）。

---

## 3. 根因（QM-5 Step ① 第一性原因）

### 3.1 第一性原因

**画幅在「输出分辨率 → 图片出图尺寸」这条链上没有单一真源，也没有覆盖全部适配器的锁。**
每个图片适配器各自决定「读哪个参数键、怎么翻译成供应商要的尺寸」，
于是同一份 `aspect_ratio: '9:16'` 在不同适配器里命运不同，失败时**全部静默**（不报错、不告警）。

### 3.2 实际下发形态（本次核实，纠正前序 PRD 的隐含假设）

`asset-generator.generateImage`（`asset-generator.js:528-541`）会**同时**下发两套信息：

```js
const ratio = opts?.aspect_ratio || '16:9'
const { width, height } = resolveImageSize(ratio)   // '9:16' → { width: 720, height: 1280 }
this._tryProviderImage(..., { ...opts, width, height })
```

`_tryProviderImage` 再把 `aspect_ratio` / `aspectRatio` / `width` / `height` **四键齐发**给适配器。
因此适配器有**两条**可用契约：**画幅键**（`aspect_ratio`）与**像素键**（`width/height`）。
只消费其中一条的适配器，在另一条缺失时就会静默退回供应商默认。

### 3.3 供应商矩阵（本次逐个核实 + 行为实测）

| 适配器 | 消费契约 | 修复前竖屏（9:16）实际结果 | 判定 | 本次处理 |
| --- | --- | --- | --- | --- |
| `agnes-image.js` | 画幅键 | 竖图（#2787 已修） | ✓ | 收敛到单一真源（等价重构） |
| `minimax-image.js` | 画幅键 | 竖图 | ✓ | 收敛到单一真源（等价重构） |
| `imagen.js` | 画幅键 + 像素键 | 竖图 | ✓ | 收敛到单一真源（等价重构） |
| `openai-image.js` | 像素键 | 竖图（1024x1792） | ✓ | **补画幅键为次级兜底**（纵深防御） |
| `local-diffusion.js` | 像素键 | 竖图（720x1280） | ✓ | **补画幅键为次级兜底**（纵深防御） |
| `flux.js` | 像素键 | 竖图（720x1280） | ✓ | **补画幅键为次级兜底**（纵深防御） |
| **`recraft.js`** | **只读 `size`，两套契约都不消费** | **恒 1024x1024 方图** | ✗ **断链** | **修复**：size → width/height → 画幅 |
| **`grok-image.js`** | **既不发 size 也不发画幅** | **供应商自选（常为横/方）** | ✗ **断链** | **修复**：按 xAI 官方 `aspect_ratio` 枚举下发 |
| **`pexels.js`** | **图库检索，不带 orientation** | **随机构图横图** | ✗ **断链** | **修复**：`orientation=portrait/landscape/square` |
| **`pixabay.js`** | **图库检索，不带 orientation** | **随机构图横图** | ✗ **断链** | **修复**：`orientation=vertical/horizontal` |
| `comfyui.js` | 无（尺寸在 workflow 图的 EmptyLatentImage 节点） | 取决于用户自备 workflow | ⚠️ **已知缺口** | **显式豁免**并登记风险与待办 |

> 关键更正：前序 PRD 把 `recraft` 归为「观察项、不盲改（因上游文档抓取超时）」，
> 实际上**不需要上游文档即可确定断链**——本适配器自己的默认 `size` 是方图，
> 而 asset-generator 从不发 `size`，该分支恒定命中方图。这是「不敢改 → 留着坑」的典型代价。

### 3.4 同源的第二个入口（非故事讲述流水线）

`CreateView.startExplainerPipeline`（AI 讲解视频 / 纪录片剪辑 / 数字人 / 动画等自动流水线）
构造 params 时**只传 `resolution`、不传 `aspectRatio`**；主进程 `resolveRuntimeStageOptions`
在 `input.aspectRatio` 缺失时**不写该键**（`set()` 遇 undefined 直接跳过），
于是这些流水线的 `generate_assets` 阶段保留 stageDef 默认 `aspectRatio: '16:9'`。
**同一个症状、同一个根因形态的第二个入口。**

### 3.5 逃逸链（QM-5 Step ②：这个 bug 怎么逃过测试的）

| 测试层级 | 本该拦住它的断言 | 为什么没拦住 |
| --- | --- | --- |
| 适配器单测 | 各适配器「竖屏画幅 → 竖图」行为锁 | **只有 agnes 有**（#2787 补的）；其余 9 个适配器无此断言 |
| 契约结构锁 | 穷举所有 `generateImage` 适配器 | 锁是**枚举式**的（逐个点名 agnes/imagen/minimax），**新增适配器不在名单内不会红** |
| 端到端 | 「720x1280 成片无黑边」 | 无跨 Provider 的画幅一致性断言；合成层 pad 兜底把问题**掩盖**成「能出片」 |
| code review | 检查参数键与调用方契约一致 | review 发生在单个适配器 diff 上，看不到「其他适配器也没读」 |

### 3.6 系统性漏洞分类（QM-5 Step ③）

1. **契约漏洞**：画幅参数无单一真源，每个适配器各自发明解析优先级 → 同一语义多种键名。
2. **测试机制漏洞**：契约锁是**枚举式白名单**而非**穷举式扫描** → 新增适配器天然逃逸。
3. **默认值掩盖**：合成层 `pad` 兜底让比例错误「有输出」，失败不显形。
4. **review 视野漏洞**：单适配器 diff 的 review 无法发现「同类适配器集体缺失」。
5. **流程漏洞**：`recraft` 因「上游文档不可核实」被搁置，而该问题**本可不依赖上游文档判定**。

---

## 4. 修复方案

### 4.1 方案选择

| 方案 | 内容 | 结论 |
| --- | --- | --- |
| **A（采纳）** | 建 `_base/aspect-ratio.js` 单一真源 + 全部适配器收敛 + 穷举式结构锁 + 两处流水线兜底 | 治本，覆盖全部断链点与未来新增适配器 |
| B（否决） | 逐个适配器打补丁（像 #2787 那样） | 治标；第 N 个适配器仍会逃逸；已实证失败一次 |
| C（否决） | 在 compose 阶段按成片画幅裁切/放大图片 | 掩盖问题：横图裁成竖图会切掉主体，且掩盖上游断链 |
| D（否决） | 统一改由 asset-generator 只发画幅键、删掉 width/height | 破坏 flux/local-diffusion/openai-image 既有正确行为，风险大于收益 |

### 4.2 单一真源：`_base/aspect-ratio.js`

统一三件事，各适配器只做「供应商方言」翻译：

| 能力 | API | 说明 |
| --- | --- | --- |
| 读 | `readAspectRatio(params)` | 固定优先级 `aspect_ratio` > `aspectRatio` > `ratio`；全缺返回 `null` |
| 解析 | `parseAspectRatio(value)` | 归一 `'9:16'` / `'1080x1920'` / `' 3 / 4 '`；**非法返回 null 且不抛错** |
| 翻译 | `resolveAspectPixelSize(ratio, {longEdge})` | 画幅 → 像素（长边固定、短边按比例吸附到 8 的倍数，钳到 ≥256） |
| 翻译 | `pickClosestSize(枚举, ratio)` | 供应商只接受固定尺寸枚举时取最接近档（OpenAI 三档） |
| 翻译 | `pickClosestAspectRatio(枚举, ratio)` | 供应商原生支持画幅枚举时取最接近档（xAI） |

**默认档位口径**（长边 1024）：`16:9→1024x576`、`9:16→576x1024`、`3:4→768x1024`、
`4:3→1024x768`、`1:1→1024x1024`。
注意这是**出图档位**，不是成片分辨率——成片由 compose 按输出分辨率决定。
`local-diffusion` 沿用其既有 512 档位（长边 512），不顺带放大既有任务的像素成本。

**fail-open 纪律**：画幅是**增强信息**，非法/缺失一律回落到适配器自身既有兜底，
**绝不抛错打断一次正常出图**，也**绝不臆造画幅**（缺画幅 ≠ 强制某画幅）。

### 4.3 各适配器的画幅方言（供应商差异，不臆造字段）

| 适配器 | 尺寸优先级 | 供应商侧形态 |
| --- | --- | --- |
| `openai-image` | `size` > `width/height` 方向 > 画幅 | DALL·E 官方仅三档，取最接近 |
| `local-diffusion` | `width/height` > 画幅（仅两者皆缺时） | SD WebUI `width`/`height` |
| `flux` | `width/height` > `image_size` 预设 > 画幅 | BFL `width`/`height` |
| `recraft` | `size` > `width/height` > 画幅 | 沿用本适配器既有 `"WxH"` 方言 |
| `grok-image` | 画幅 | xAI 原生 `aspect_ratio` 枚举（**不臆造 `size`**） |
| `pexels` | 画幅 | `orientation=portrait/landscape/square` |
| `pixabay` | 画幅 | `orientation=vertical/horizontal`（**无 square，方屏不传**） |
| `agnes-image` / `minimax-image` / `imagen` | 画幅（单一真源） | 行为等价收敛 |

### 4.4 流水线层两处兜底（纵深防御）

1. `story2video-stages.js` 的 `resolveAspectRatio(params, stage)`：
   `params.aspectRatio` → `stage.options.aspectRatio` → **按输出分辨率推导** → `'16:9'`。
   推导规则复用 `story2video-text-config.deriveStory2VideoAspectRatio`（与校验层**同源**，
   杜绝「校验认为合法、运行时用另一个画幅」）。
2. `CreateView.startExplainerPipeline`：`aspectRatio: getStory2VideoOutputAspectRatio(output.resolution)`。

---

## 5. 数据校验（验收即校验链）

| 层 | 校验规则 | 失败行为 | 本次变更 |
| --- | --- | --- | --- |
| 渲染层 | `getStory2VideoOutputAspectRatio(resolution)`：分辨率 → 画幅查表（`720x1280→9:16`、`1080x1440→3:4`、`1080x1080→1:1`）；未命中兜底 `9:16` | 不抛错，取默认 | 复用；并补到 explainer 入口 |
| 主进程 normalizer | `normalizeAspectRatio(value, size)`：画幅**必须与输出分辨率匹配**，不匹配抛 `Story2Video image.aspectRatio 必须与输出分辨率匹配`；枚举白名单 `16:9/9:16/1:1/4:3/3:4` | 抛校验错误，任务不启动 | 复用；新增 `deriveStory2VideoAspectRatio` 导出供阶段层同源推导 |
| `size` 格式 | `normalizeSize`：`/^\d{2,4}x\d{2,4}$/`，宽高均在 160–7680 | 抛 `必须使用 WIDTHxHEIGHT 格式` / `超出 160-7680 像素范围` | 既有，未改 |
| 阶段层 | `resolveAspectRatio`：显式 → stageOptions → 按分辨率推导 → `16:9` | 不抛错，逐级兜底 | **本次改**（去掉写死 16:9 早退） |
| 桥接层 | `asset-generator` 四键齐发（`aspect_ratio` + `aspectRatio` + `width/height`） | 不校验，纯透传 | 既有 |
| 适配器层 | `readAspectRatio` 三键优先级；`parseAspectRatio` 非法返回 `null` | **不抛错**，回落各自既有兜底 | **本次统一** |
| 供应商枚举层 | `pickClosestSize` / `pickClosestAspectRatio` 归一到枚举内 | 枚举外值**不会下发**（防上游 400） | 本次新增 |

**画幅合法性为什么不在适配器层做二次枚举校验**：
Story2Video 的画幅已由 normalizer 白名单强校验；适配器层要处理的是**下游直调方**与
**像素换算**，重复校验只会制造两处真相。供应商拒收时走既有重试/报错链路即可。

---

## 6. 流程与功能逻辑（修复后）

```
用户选择输出分辨率（如 720x1280）
  ├─ 故事讲述流水线
  │    → buildStory2VideoTextConfig：image.aspectRatio = getStory2VideoOutputAspectRatio('720x1280') = '9:16'
  │    → normalizeStory2VideoTextParams：按 size 派生并强校验一致 → stageOptions + 顶层 params 双写
  │    → generate_assets：resolveAspectRatio() = '9:16'
  └─ 其余自动流水线
       → startExplainerPipeline：resolution + aspectRatio 一并下发

generate_assets → assetGenerator.generateImage(prompt, { aspect_ratio:'9:16', ... })
  → resolveImageSize('9:16') = { width:720, height:1280 }，四键齐发
  → aiGenerator.generate('image', provider, { aspect_ratio, aspectRatio, width, height })
  → 适配器按 §4.3 优先级解析
       ├ 像素键型（openai/flux/local-diffusion/recraft）→ 竖图
       ├ 画幅枚举型（grok-image）→ aspect_ratio='9:16'
       └ 检索型（pexels/pixabay）→ orientation=portrait/vertical
  → 返回竖图 → compose 的 decrease+pad 兜底不再产生黑边
```

**历史项目处理**：`mur2tzc8_ru1r` 已落盘的横屏图片**不迁移**。
重新生成场景图片即按新画幅出图；历史成片保持原样（不追溯重渲染，避免二次成本与不可逆操作）。

---

## 7. 交互逻辑、显示项与提示文字

### 7.1 交互逻辑

- **无新增交互**：修复全部发生在主进程参数链与渲染层提交参数，用户操作路径、按钮、入口完全不变。
- **无新增/修改文案**：`locales/zh.js` 与 `locales/en.js` **零改动**，
  不触发 `check-locale-sync`（CI Gate 7）。
- 用户可感知变化：同一配置下**重新生成**场景图片，图片画幅与成片一致，黑边消失。
- 既有文案「素材模式/全部故事讲述/视频+故事讲述」等与画幅无关，保持不变。

### 7.2 显示项

- 分辨率下拉的选项与标签（`9:16竖屏 720x1280` 等）**未改动**。
- 折叠区摘要（`S2V_SUMMARY_FIELDS.basic` 含 `output.resolution`）**未改动**。
- 画幅对用户**始终不可见**：不新增「画幅」显示项——它是输出分辨率的**派生量**，
  单独暴露会让用户产生「分辨率与画幅是两件事」的误解，反而引入新的不一致入口。

### 7.3 提示文字

- 本次**不新增任何提示文字**。
- 特别说明：**未**新增「检测到图片画幅与成片不符」这类告警。理由见 §8.4「刻意留下的缺口」。

---

## 8. 测试与回归保护（QM-5 Step ④）

### 8.1 行为锁（真实执行 generateImage，断言下游请求体）

`electron/services/adapters/image-aspect-ratio-portrait-regression.test.js`：
逐适配器断言「`aspect_ratio=9:16` 真的变成竖图」。

| 适配器 | 断言 |
| --- | --- |
| openai-image | `9:16` → `size='1024x1792'`；`16:9` → `'1792x1024'`；显式 `size` 优先；无画幅回 `1024x1024` |
| grok-image | `9:16` → `aspect_ratio='9:16'` 且**不得出现 `size`**；`1080x1920` 归一到 `9:16`；无画幅不下发 |
| recraft | 实参形态（`aspect_ratio`+`width/height`）→ `720x1280`；仅画幅 → `576x1024`；显式 `size` 优先；无画幅回方图 |
| flux | `9:16` → `width/height` 竖图；显式 `width/height` 优先；`image_size` 预设优先 |
| local-diffusion | `9:16` → 竖图；显式尺寸优先；无画幅维持 `512x512` |
| pexels | `9:16`→`orientation=portrait`；`16:9`→`landscape`；`1:1`→`square`；无画幅不下发 |
| pixabay | `9:16`→`orientation=vertical`；`16:9`→`horizontal`；方屏与无画幅不下发 |

`electron/services/story2video-stages-aspect-ratio.test.js`：
流水线层「漏传画幅时按分辨率推导」——`720x1280→9:16`、`1080x1440→3:4`、
`1920x1080→16:9`、`stage.options.resolution` 同样参与推导、显式值优先级最高、
两者皆缺维持 `16:9`。

`apps/desktop/src/views/CreateView.test.js`：
渲染层 explainer 入口——`720x1280` 时 `animated-explainer` 收到 `aspectRatio:'9:16'`。

`_base/aspect-ratio.test.js`：单一真源自身的行为锁（优先级、归一、方向不变式、非法输入 fail-open）。

### 8.2 结构锁（穷举式，防新增适配器逃逸）

`image-adapter-aspect-contract.test.js` 由**枚举式**升级为**穷举式**：

1. 动态扫描适配器目录，找出所有实现 `async generateImage(` 的文件；
2. 断言**扫描结果非空**（防止扫描规则本身失效导致全绿空转）；
3. 每个适配器必须 `readAspectRatio(`，否则必须落在 `EXEMPT_ADAPTERS` 白名单里；
4. 白名单每条**必须写明豁免理由**（理由为空即红）；
5. 白名单**不得包含已消费画幅的适配器**（防滥用豁免藏真 bug）；
6. 白名单文件**必须真实存在**（防改名后豁免空转）；
7. 任何适配器**不得自研** `params.aspect_ratio || ...` 优先级（必须走单一真源）。

### 8.3 变异反证

| 变异 | 预期变红 |
| --- | --- |
| 删掉任一适配器的 `readAspectRatio(` | 结构锁穷举断言 |
| 把 recraft 的 `resolveRecraftSize` 还原为 `params.size \|\| DEFAULT_SIZE` | recraft 行为锁 2 例 |
| 把 `resolveAspectPixelSize` 竖屏分支改反 | `_base/aspect-ratio.test.js` + recraft/flux/local-diffusion 行为锁 |
| 把阶段层 `resolveAspectRatio` 还原为写死 `'16:9'` 早退 | `story2video-stages-aspect-ratio.test.js` |
| 删掉 `startExplainerPipeline` 的 `aspectRatio` | `CreateView.test.js` 渲染层用例 |
| 把 `EXEMPT_ADAPTERS` 的理由清空 | 白名单理由断言 |

### 8.4 刻意留下的缺口（不假装已闭合）

1. **comfyui 出图比例未修**：尺寸写在用户自备 workflow 图里，适配器无生效路径。
   已进 `EXEMPT_ADAPTERS` 并写明风险与待办（接入 workflow 模板时同步消费画幅）。
   **使用 comfyui 作为图片 Provider 时，竖屏成片仍可能出横图。**
2. **未加「出图画幅与成片不符」的运行期告警**：验证出图比例需要读图片真实像素，
   会引入图片解码依赖与额外的失败分支。代价是「Provider 静默忽略画幅」这类问题
   仍只能在测试期发现，而非用户运行期。已评估为「本期不做」并在此登记，
   待有实测反馈（确有用户遇到 Provider 忽略画幅）时再排期。

---

## 9. 质量门禁与影响面

| 项 | 结果 |
| --- | --- |
| 会话隔离 | ✅ 独立 worktree `mp-fix-s2v-image-aspect-adapters` + 裸分支，主目录保持 main clean |
| 回归 | ✅ adapters 全量 64 文件 / 1671 用例通过；story2video-stages 242 用例通过（含既有 154） |
| locale | ✅ zh/en 零改动 |
| UI 文件 | ⚠️ 改到 `CreateView.vue`（渲染层参数提交），按 §9.1 走视觉回归判定 |
| 依赖 | ✅ 零新增依赖 |

### 9.1 影响面

- **新增**：`adapters/_base/aspect-ratio.js`（单一真源）+ 其单测 +
  `image-aspect-ratio-portrait-regression.test.js` + `story2video-stages-aspect-ratio.test.js`。
- **行为变更**：`recraft` / `grok-image` / `pexels` / `pixabay`（**这 4 个是真正的断链修复**）。
- **等价重构**：`agnes-image` / `minimax-image` / `imagen` 收敛到单一真源（行为不变）。
- **纵深防御**：`openai-image` / `flux` / `local-diffusion` 补画幅键为次级兜底（既有路径优先，行为不变）。
- **流水线层**：`story2video-stages` 兜底改为按分辨率推导；`CreateView` explainer 入口补画幅。
- **显式豁免**：`comfyui`（附理由与待办）。

---

## 10. 预防措施（QM-5 Step ⑤ 落地清单）

1. **单一真源**：`_base/aspect-ratio.js` 成为画幅解析唯一实现；新增图片适配器**必须**经
   `readAspectRatio` 读画幅（结构锁第 7 条强制）。
2. **穷举式结构锁**：契约锁从枚举白名单升级为目录扫描，**新增适配器若不消费画幅即 CI 红**，
   不再依赖「记得去补名单」。
3. **豁免显式化**：无法消费的适配器必须写进 `EXEMPT_ADAPTERS` 并附理由与待办；
   理由缺失即红，豁免是决策不是遗漏。
4. **纵深防御**：流水线层按输出分辨率推导兜底，缺上游传参也不静默降级。
5. **同源推导**：校验层与运行时层共用 `deriveStory2VideoAspectRatio`，杜绝两处真相。
6. **文档更正**：本 PRD §3.3 更正前序 PRD §2.4 的供应商矩阵；「不敢改 → 留坑」的代价被记录。
