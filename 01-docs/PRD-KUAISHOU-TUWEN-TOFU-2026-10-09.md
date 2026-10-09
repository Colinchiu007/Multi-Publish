# PRD：快手图文封面 tofu 乱码修复（fix-kuaishou-tuwen-tofu，2026-10-09）

## 1. 背景与问题现象

用户通过应用发布的快手图文内容，在快手创作者中心看到图片上的中文文字全部渲染为方块（tofu 乱码），
仅 ASCII 字符（数字、字母）可读。附件截图与本地证据文件
`D:\Temp\story2video\assets\default\img_9400.png`（发布「白应苍临刑前称随口1个资金盘就20亿」时
的封面）逐像素吻合：纯深蓝底（`#1a1a2e`）+ 居中一行白色文字，中文全部为空心方块，
只有标题中的「1」「20」两个数字正常渲染。

## 2. 根因链（QM-5 第 1 步：第一性原因）

```
usePublishFlow.js（图文平台无图自动附封面）
  └─ generateAiCover({ prompt: 文章标题, ratio: '3:4' })
      └─ IPC cover:generate-ai（apps/desktop/electron/ipc-handlers/publish.js）
          └─ assetGenerator.generateImage(prompt, { style:'cinematic', aspect_ratio, outputDir })
              ├─ 未配置生图 provider → _tryProviderImage 返回 null
              └─ ffmpeg drawtext 占位图（asset-generator.js generateImage 兜底分支）
                  · 背景 0x1a1a2e（cinematic 风格色，与实锤图片底色一致）
                  · drawtext 白字 fontsize=36 居中（与实锤图片排版一致）
                  · Windows 打包版 ffmpeg 的 drawtext 无 CJK 字形
                    → 中文全部渲染为 tofu 方块，ASCII 正常   ← 【渲染缺陷层】
          └─ handler 只判 result.code === 0 即返回成功
              · 未检查 result.data.degraded === true 占位标记
              · tofu 占位图被当作「AI 封面」成功返回并上传快手  ← 【契约缺陷层（本次修复点）】
```

- **渲染缺陷层**：asset-generator 的 ffmpeg 占位图分支（commit e1b46eba0 引入）面向
  Story2Video 内部分镜草稿示意，不面向对外发布；Windows 打包环境 drawtext 无 CJK 字形。
- **契约缺陷层**：cover:generate-ai（commit b414d35c5，2026-09-12 引入）把
  `degraded:true` 的占位图与真实 AI 生图同等对待——这是 tofu 图进入发布链路的直接原因。
- 时间线佐证：`shared-user-data/logs/app-2026-10-06.log` 中
  `cover:generate-ai ok :: path=D:\Temp\story2video\assets\default\img_9400.png 耗时=112ms`
  —— 112ms 不可能是真实 AI 生图，是 ffmpeg 占位图的典型耗时。

## 3. 修复方案

### 3.1 功能逻辑

`cover:generate-ai` handler 在 `assetGenerator.generateImage` 返回后，新增占位图判定：

- 判据：`result.data.degraded === true`（asset-generator 占位图专用标记，`source: 'ffmpeg-placeholder'`）。
- 处理：视为 AI 生成失败，走既有 `fallbackLocalCover('ai-generate-degraded-placeholder')`
  本地标题卡兜底（SVG→sharp/Pango 渲染，字体栈含 `Microsoft YaHei`/`PingFang SC`，CJK 正常）。
- 日志：`cover:generate-ai failed :: error=AI 生图返回的是 ffmpeg 占位图（无真实生图 provider），拒绝作为封面`。

### 3.2 数据校验

- 入参校验不变（prompt 2–500 字符、style/ratio 白名单）。
- 出参新增一条校验：**降级产物（degraded）不得以 `source:'ai'` 成功返回**。
  本地兜底成功时返回 `source:'local-fallback'` + `theme`/`themeLabel`/`keywords`（既有契约）。

### 3.3 流程（修复后）

```
图文平台无图 → generateAiCover
  → cover:generate-ai
      ├─ 配置了真实生图 provider 且成功（非 degraded） → 返回 source:'ai'
      ├─ provider 失败 / 未注入 / 返回占位图(degraded) → local-cover-generator 本地标题卡
      │    └─ 兜底仍失败 → 返回错误（不阻断无图平台发布，图片平台由引擎层如实报错）
```

### 3.4 显示项与提示文字（不变）

- 渲染端按 `source` 区分提示：`ai` →「AI 封面生成成功」；`local-fallback` →
  「本地封面生成成功（AI 生图不可用，已按文章内容生成封面）」。本次修复不新增 locale 键，
  复用既有文案（`usePublishFlow.js` 的 `publishPage.publishFlow.coverGenerated` 等）。

## 4. QM-5 第 2 步：测试逃逸链

| 层级 | 为什么没拦住 |
| --- | --- |
| 单元测试 | 既有用例只覆盖「code!==0 回退」与「code===0 返回 ai」，**没有 degraded 占位图用例**——mock 夹具只造了成功/失败两态，第三态（degraded 成功码）不可表示 |
| 集成测试 | cover:generate-ai 的注入式 IPC 合同测试未包含 asset-generator 真实兜底分支（生产 assetGenerator 未注入时走 local，注入时 mock 恒 code:0 无 degraded） |
| E2E | hot-topics-article-publish-driver 只断言发布终态 success，不校验封面图片内容的字形 |
| 视觉回归 | 封面为运行时生成文件，不在视觉基线覆盖域 |
| 代码审查 | `degraded` 字段在 asset-generator 侧有语义，但跨模块消费点（handler）没有按字段分流 |

**系统性漏洞分类**：测试场景缺失（degraded 第三态）+ 跨模块契约字段无人消费。

## 5. QM-5 第 3 步：回归保护

`apps/desktop/electron/ipc-handlers/publish.test.js` 新增用例
「degraded 占位图（ffmpeg-placeholder）不得当成功返回，必须回退本地封面」：

- mock assetGenerator 返回 `{code:0, data:{path:'.../img_9400.png', source:'ffmpeg-placeholder', degraded:true}}`；
- 断言 handler 返回本地兜底产物（coverPath 不含 img_9400、`source==='local-fallback'`）；
- 反证（红灯先行）：修复前该用例红（Received: `img_9400.png`），修复后 37/37 绿。

## 6. QM-5 第 5 步：预防措施

1. 回归测试接 CI（publish.test.js 已在 vitest workspace 自动收集）。
2. learnings 记录「占位图/降级产物不得跨模块当成功产物消费」模式（本 PR 同步）。
3. 后续若 Story2Video 需要对外展示占位图，必须先给 drawtext 接 CJK fontfile——属独立任务，不在本次范围。

## 7. 范围外事项（明确不做）

- 不修改 asset-generator 的占位图行为（Story2Video 内部草稿示意依赖它，改动影响面大且与
  本缺陷的直接链路无关——本次在消费边界收口）。
- 不修改 usePublishFlow（无图附封面流程本身正确，问题在封面来源质量）。
