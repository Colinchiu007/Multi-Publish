# PRD — Story2Video 竖屏成片图片宽高比断链修复（fix-s2v-portrait-image-aspect，2026-10-02）

> 关联 Bug 报告：项目 ID `mur2tzc8_ru1r`，分辨率选择 720x1280 时成片确为竖屏，但生成的图片为横屏（画面两侧黑边、主体未充满）。
> 修复分支：`fix-s2v-portrait-image-aspect`（隔离 worktree `D:\Data\projects\mp-worktrees\mp-fix-s2v-portrait-image-aspect`）。

---

## 1. 背景与现象

### 1.1 用户可见现象

- 用户在「视频创作 → 故事讲述」流水线选择分辨率 **720x1280（9:16 竖屏）**；
- 成片 `video.mp4` 尺寸正确为 **720x1280 竖屏**；
- 但成片中每一场景的画面左右出现**大面积黑色填充带**，中心只有一条横向画面带；
- 独立查看场景图片素材（`segment_XXXX_image.png`）确认为**横屏**图片。

### 1.2 实测取证（项目 mur2tzc8_ru1r）

| 证据项 | 实测值 | 说明 |
| --- | --- | --- |
| `project.json → options.resolution` | `720x1280` | 输出分辨率正确传递 |
| `project.json → options.aspectRatio` | `9:16` | 阶段选项正确传递 |
| 成片 `video.mp4`（ffprobe） | `720x1280` | compose 引擎正确 |
| `segment_0000_image.png`（GDI 实测） | **2624x1472（16:9 横屏）** | **Bug 现场实锤** |
| `segments[0].imageMeta.provider` | `agnes-multimodal` | 实际走的图片供应商 |
| `segments[0].imageMeta.model` | `agnes-image-2.1-flash` | 实际图片模型 |
| 全部 16 段图片 | 均 ~2.5MB 级横屏 PNG | 全量复现，非偶发 |

### 1.3 黑边形态的机理

合成引擎（`story2video-compose-engine.js` 的 `buildScaleFilter`）对每个素材执行
`scale=<W>:<H>:force_original_aspect_ratio=decrease, pad=<W>:<H>:(ow-iw)/2:(oh-ih)/2:color=black`。
横屏 16:9 图进入 9:16 竖屏画布时按「decrease」等比缩至宽 720（此时高仅 ~405），上下不足部分由
`pad` 以黑色补齐——即截图中画面居中、上下（对应竖屏的左右黑带）为黑的形态。
**合成层行为正确**（对任何比例素材的兜底是设计内行为），根因在上游图片生成。

---

## 2. 根因（第一性原因，QM-5 Step ①）

### 2.1 根因链

```
CreateView / 快照
  → story2videoTextConfig.image.aspectRatio = '9:16'          （前端 ✓）
  → normalizeStory2VideoTextParams 派生校验通过，写入
      stageOptions.generate_assets.aspectRatio = '9:16'
      顶层 params.aspectRatio = '9:16'                         （normalizer ✓）
  → story2video-stages.js generate_assets：
      const aspectRatio = firstDefined(params.aspectRatio, stage.options?.aspectRatio, '16:9')
      → '9:16'                                                 （阶段层 ✓）
  → generateOneImage：assetGenerator.generateImage(prompt, { ..., aspect_ratio: '9:16' })
      → asset-generator.js：imageParams = { aspect_ratio: opts.aspect_ratio,
                                            aspectRatio: opts.aspect_ratio, ... }（桥接层 ✓）
  → aiGenerator.generate('image', 'agnes-multimodal', imageParams)
  → AgnesMultimodalAdapter.generateImage → AgnesImageAdapter.generateImage
      const ratio = params.ratio || DEFAULT_RATIO              （✗✗✗ 断链点）
      → '9:16' 从未进入 Agnes 请求体 → 请求体 ratio 恒为默认 '16:9'
  → Agnes 服务返回 2624x1472 横屏图
  → compose 竖屏画布黑边
```

### 2.2 断链点定性

- 位置：`apps/desktop/electron/services/adapters/agnes-image.js` 的 `generateImage()`。
- 性质：**参数键名不匹配的静默契约断裂**。`ratio` 是 **Agnes API 请求体字段名**，被误用作
  **输入参数契约名**；而流水线统一契约键是 `aspect_ratio`（snake_case，asset-generator /
  story2video-stages 桥接）与 `aspectRatio`（camelCase，normalizer / agnes-multimodal
  的 generateVideo 同类解析）。
- 后果形态：**静默降级**——不报错、不告警，宽高比恒为默认 16:9。所有显式选择竖屏的用户在
  Agnes 供应商下全部命中，无任何错误日志可循。

### 2.3 引入点追溯（git blame）

- 引入 commit：`c9df8bf5`（2026-07-15，「feat(providers): 新增 9 个模型供应商 Adapter + 前端设置弹窗入口」）。
- 当时意图：按 Agnes 官方文档封装 `/images/generations` 请求体（`{ model, prompt, size, ratio, extra_body }`），
  封装本身正确；失误在于**把请求体字段名直接当成了适配器入参名**，且无任何消费方传 `ratio`。

### 2.4 供应商矩阵清点（同族排查，QM-5 Step ③）

对全部图片生成适配器的宽高比入参解析逐一核查：

| 适配器 | 入参解析 | 判定 |
| --- | --- | --- |
| `minimax-image.js` | `params.aspect_ratio → parseAspectRatio(size)` | ✓ 正常 |
| `imagen.js` | `aspectRatio → aspect_ratio → width/height 最近比推导` | ✓ 正常 |
| `flux.js` / `local-diffusion.js` | 直接消费 `width/height`（asset-generator 已传） | ✓ 正常 |
| `openai-image.js` | `width/height → 1792x1024 / 1024x1792` | ✓ 正常 |
| `agnes-image.js`（修复前） | **只读 `params.ratio`** | ✗ **断链** |
| `agnes-image.js`（修复后） | `aspect_ratio → aspectRatio → ratio → 默认 16:9` | ✓ |

补充观察项（记录，不在本 PR 修改）：
- `recraft.js` 只读 `params.size`，而调用方传的是 `width/height` → 竖屏请求会落 1024x1024 方形。
  因 Recraft 官方尺寸白名单暂无法核实（docs.recraft.ai 抓取超时），且无用户实测报告，按「观察项」
  登记至 `01-docs/tech-debt.md`，待上游文档核实后另行修复，**不盲改**。
- `podcast-repurpose-stages.js` 的 visualize 阶段默认 `aspect_ratio: '16:9'`，而其 compose 固定
  720x1280 竖屏——同一形态的「产品默认值」问题（非契约断链），已登记观察项，待产品确认竖屏语义后另行处理。

---

## 3. 修复方案

### 3.1 方案对比

| 方案 | 内容 | 评估 |
| --- | --- | --- |
| **A（采纳）** | `agnes-image.js` 入参解析扩展为 `aspect_ratio || aspectRatio || ratio || 默认` | 最小改动；三键兼容；与 minimax/imagen/agnes-multimodal 的既有解析风格一致；向后兼容 |
| B（否决） | 把上游 asset-generator 改为传 `ratio` | 需要改动桥接层且为 Agnes 一家供应商污染公共契约；其他适配器未来仍可能犯同型错误 |
| C（否决） | 在 agnes-image 内按 `width/height` 推导比 | asset-generator 传入的 width/height 恒为 `resolveImageSize(aspect_ratio)` 的产物，等于绕一圈回到契约键，徒增间接层 |

### 3.2 实施（方案 A）

```js
// 修复前
const ratio = params.ratio || DEFAULT_RATIO

// 修复后（解析优先级 aspect_ratio > aspectRatio > ratio > 默认 16:9）
const ratio = params.aspect_ratio || params.aspectRatio || params.ratio || DEFAULT_RATIO
```

- 请求体字段名保持 `ratio`（Agnes API 契约不变）；
- `params.ratio` 键保留为向后兼容（直接调用方 `agnes-multimodal.test.js` 既有用例即以此键传参）；
- 同步更新 JSDoc：三个键的语义与优先级。

---

## 4. 数据校验（验收即校验链）

| 层 | 校验 | 现状 |
| --- | --- | --- |
| 渲染层 | `getStory2VideoOutputAspectRatio(resolution)` 从分辨率映射画幅（`720x1280 → 9:16`） | 既有，未改动 |
| 主进程 normalizer | `normalizeAspectRatio(value, size)`：画幅必须与输出分辨率匹配（不匹配直接抛 `Story2Video image.aspectRatio 必须与输出分辨率匹配`） | 既有，未改动 |
| 阶段层 | `firstDefined(params.aspectRatio, stage.options?.aspectRatio, '16:9')` | 既有，未改动 |
| 桥接层 | `asset-generator` 双键透传（`aspect_ratio` + `aspectRatio`） | 既有，新增结构锁 |
| 适配器层 | **本次修复**：三键解析 + 缺省回退 16:9 | 新增回归测试 + 结构锁 |

说明：aspectRatio 的**合法性**由 normalizer 白名单校验（`16:9/9:16/1:1/4:3/3:4`），适配器层不做
二次枚举校验——供应商若拒绝某画幅会返回上游错误并进入既有重试/报错链路，无需本地预判。

---

## 5. 流程与功能逻辑（修复后）

1. 用户选择任意输出分辨率 → normalizer 派生并校验 `image.aspectRatio`；
2. `generate_assets` 阶段读取 aspectRatio 并传入 `assetGenerator.generateImage`（`aspect_ratio` 键）；
3. `asset-generator` 展开为像素 `width/height`（`resolveImageSize`）并**双键透传**给 `aiGenerator.generate('image', ...)`；
4. Agnes 适配器按 `aspect_ratio → aspectRatio → ratio` 优先级取值 → 写入请求体 `ratio`；
5. Agnes 返回**与成片画幅一致**的图片（如 9:16 → 竖图）；
6. compose 的 `decrease+pad` 兜底仍保留（对用户自选素材等非模型图片的合理兜底）。

---

## 6. 交互逻辑与显示项

- **无新增交互**：修复完全在主进程参数链，用户操作路径不变；
- **无新增提示文字**：不涉及 locales（zh/en 无改动，已过 `check-locale-sync`）；
- 用户可感知变化：同一配置下重新生成场景图片，图片画幅与成片一致，黑边消失；
- 历史项目（如 mur2tzc8_ru1r）已落盘的横屏图片**不做迁移**（重新生成场景图片即可获得正确画幅；
  历史成片保持原样，不追溯重渲染）。

---

## 7. 测试与回归保护（QM-5 Step ④）

### 7.1 行为回归（fetch mock，真实执行 generateImage 并断言请求体）

| 测试 | 文件 | 场景 |
| --- | --- | --- |
| `aspect_ratio（流水线契约键）→ 请求体 ratio（2026-10-02 回归）` | `agnes-image.test.js` | `aspect_ratio: '9:16'` → 请求体 `ratio === '9:16'` |
| `aspectRatio（camelCase 别名）→ 请求体 ratio` | `agnes-image.test.js` | `aspectRatio: '3:4'` → 请求体 `ratio === '3:4'` |
| `无任何宽高比参数时回退默认 16:9` | `agnes-image.test.js` | 仅传 `width/height` → `ratio === '16:9'`（显式缺省语义） |
| `generateImage 委托链保留 aspect_ratio 契约键` | `agnes-multimodal.test.js` | 多模态预设 → AgnesImageAdapter 委托全链透传 |
| `params.aspectRatio 显式透传给 generateImage` | `podcast-repurpose-stages.test.js` | 流水线阶段层 → assetGenerator 透传 |

### 7.2 结构锁（防再犯，QM-5 Step ⑤）

新文件 `electron/services/adapters/image-adapter-aspect-contract.test.js`：

- 逐文件扫描源码，断言关键图片适配器的宽高比解析表达式**同时包含** `aspect_ratio` 与
  `aspectRatio`（或既有等价分支）；
- 断言 `asset-generator.js` 双键透传、`story2video-stages.js` 两条路径（assetGenerator +
  legacy Python）均传 `aspect_ratio`；
- **反证纪律已实测**：把修复行变异回单键 `params.ratio || DEFAULT_RATIO` → 结构锁与行为测试
  3 用例立即变红；恢复后全绿。锁在跑、非摆设。

### 7.3 测试结果

| 范围 | 结果 |
| --- | --- |
| 4 个目标测试文件（TDD RED→GREEN） | 81/81 通过 |
| adapters 目录全量 | 62 文件 / 1612 用例全部通过 |
| asset-generator + story2video 合同/项目服务 | 264 用例通过 |
| 变异反证（还原 bug 代码） | 3 用例失败（预期红）→ 恢复后全绿 |

---

## 8. 质量门禁执行记录

| 门禁 | 结果 |
| --- | --- |
| 会话隔离（pre-code-edit-guard 拒绝共享根 → `session-init.sh` 建 worktree + 依赖验证） | ✅ |
| TDD（先 RED 后 GREEN） | ✅ |
| QM-1 打包（`electron-builder --win --dir` exit 0；asar 含 `agnes-image.js`；require 链 OK；打包 exe 启动 12s 存活、stderr 0 行） | ✅ |
| QM-2 代码审查（无 CRITICAL/MAJOR；diff 逐行复核） | ✅ |
| QM-4 视觉回归 | 跳过（零 UI 文件变更，纯主进程） |
| locale 成对 / CJK / 品牌残留 / 超大文件 / 门禁欠账 | ✅ 全绿 |
| eslint（改动文件） | ✅ exit 0 |

## 9. 预防措施（QM-5 Step ⑤ 落地清单）

1. **结构锁**：`image-adapter-aspect-contract.test.js` 锁死全部图片适配器的宽高比契约键解析（新增适配器若解析单键，可在此登记断言；漏登记不会豁免行为回归）；
2. **AGENTS.md QM-2 新增条目**：「适配器入参键必须与调用方契约键一致」——新增/修改 Adapter 时，必须从调用方（asset-generator / stages）反查实参键名，禁止以 API 请求体字段名充当入参名；见根 `AGENTS.md` 同名条目；
3. **`01-docs/tech-debt.md`**：登记 recraft size 契约与 podcast 默认画幅两个观察项；
4. **`01-docs/learnings.md`**：沉淀「字段恒空/恒回退的第一性诊断」与「API 请求体字段名 ≠ 入参契约名」两条经验。

## 10. 影响面

- 改动文件：`agnes-image.js`（+14/-2）、3 个既有测试文件（+78）、1 个新结构锁测试文件；
- 不改：渲染层、normalizer、compose 引擎、locales、CI 配置、依赖清单；
- 兼容性：`params.ratio` 直调方不受影响；其他图片适配器行为零变化；
- 风险：低——单行解析链扩展，全量适配器测试（1612）与打包启动验证通过。
