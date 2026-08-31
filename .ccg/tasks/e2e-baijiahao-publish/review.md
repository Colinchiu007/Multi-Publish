# 双模型审查报告 — E2E 百家号发布（bug 修复 + 新功能）

审查时间：2026-08-31
审查范围：`usePublishFlow.js`、`Publish.vue`、`publish-contract.js`、`baijiahao.js` + 3 个测试文件
审查模型：Claude + opencode（双模型并行交叉验证）

## 验证基线

- 桌面端测试：publish-contract 17 + Publish 43 = 60 项全通过
- api-publish-engine：Vitest 组 48 项全通过（含 baijiahao-api-chain 24 项）
- 149 字节上限推导正确：后端 `Math.floor(utf8Bytes/3) > 49` → `utf8Bytes >= 150` 拒绝，安全上限 149 字节，前后端阈值一致
- 代理对安全：`truncateByUtf8Bytes`/`truncateTitle` 均 `Array.from` 按码点遍历 + 逐码点计字节，不切断 emoji；测试覆盖 4 字节 emoji、149 字节边界、混合字符
- AI 声明合规链路完整：`Publish.vue` 默认 `aiGenerated:true` → `usePublishFlow` `!== false` 默认勾选 → `baijiahao.js` `aigc_bjh_status is_checked=1`，三处默认方向一致
- 无新增安全风险：解码值写入表单 v-model 非 HTML（无 XSS）、无死循环、日志仅回显 errno/errmsg 脱敏、无新增硬编码密钥

## Critical（合入前必须修复）

### C1. 多平台发布时截断后不重新校验，会误伤标题上限更严格的其他平台

- 位置：`usePublishFlow.js:303-314`
- 问题：`validatePlatformContent` 只返回第一个失败平台。当选 `[baijiahao, xiaohongshu(20字)/toutiao(30字)]` 时，若第一个失败恰是 baijiahao/title，代码截断全局 `article.title` 到 ≤149 字节（约 49 中文字符）后**直接继续发布，不再校验其余平台**。其余 adapter 均无标题截断守卫（仅 baijiahao 新增 `truncateTitle`），xiaohongshu/toutiao 会带着 49 字符超限标题进入发布 → 服务端失败且无友好预检提示。违背代码注释声称的「只对 baijiahao title 生效、不误伤其他平台」。
- 修复：截断后对**剩余平台**重新执行一次 `validatePlatformContent`，仍有失败则提示并阻断；或仅在 baijiahao 为唯一选中平台时启用自动截断。

### C2. 平台差异化 override 标题超长时，前端自动截断实际失效

- 位置：`usePublishFlow.js:307-309` + `publish-contract.js:354`
- 问题：校验用 `override.title || article.title`，但自动截断只改 `article.title`，**不改 `diffEdits[platform].title`**。`buildArticleData()` 仍按原样发送 `platformOverrides`。若用户为 baijiahao 单独设置了超长标题，前端截断对 override 路径无效，仅靠后端 `baijiahao.js:240` 的 `truncateTitle` 兜底。该逻辑对 override 是无效代码，且会误导维护者。
- 修复：当失败字段来自 override 时，截断 `diffEdits[platform].title`（或直接提示阻断）。

## Major（建议修复）

### M1. 截断后无用户通知

- `usePublishFlow.js:304-313`：`article.title` 被静默修改（如 66 字符 → 49 字符），无 toast/进度条提示，用户可能不理解标题为何变化，且截断永久修改了 reactive `article.title`，取消发布后原始标题丢失。
- 修复：截断后调用 `addProgress('百家号标题已按 149 字节上限自动截断', 'warning')` 或 `notifyInfo(...)` 提示用户。

### M2. `utf8ByteLength` 兜底分支字节计算有误

- `publish-contract.js:284-289`：兜底逻辑 `ch.codePointAt(0) > 0x7f ? 3 : 1` 对 2 字节 UTF-8 字符（Cyrillic/Latin Extended）多算 1 字节，对 4 字节补充平面字符（emoji）少算 1 字节。Electron renderer 恒有 `TextEncoder`，风险极低，但注释「中文 3 字节/其余 1 字节」与实现不符。
- 修复：兜底改为精确计算 `cp <= 0x7F ? 1 : cp <= 0x7FF ? 2 : cp <= 0xFFFF ? 3 : 4`，或标注仅作估算。

### M3. `truncateByChars` 是死代码

- `publish-contract.js:267-271`：导出但未被任何生产代码引用（仅测试使用），增加维护负担和包体积。
- 修复：若预留给未来平台截断使用，加 `@since` 注释说明；否则移除。

### M4. 前后端空值处理不一致

- 后端 `baijiahao.js` `String(value || "")` 会将 `0`/`false` 视为空串，前端 `String(value ?? '')` 仅对 `null`/`undefined` 兜底。
- 修复：统一为 `String(value ?? '')` 或 `String(value || "")` 并加注释说明。

### M5. 循环解码上限 3 次缺注释 + 过度解码风险

- `Publish.vue:866-876`：双重编码最多需 2 次解码，上限 3 留了余量但意图不明。对单次编码的值，若解码结果恰含合法 `%XX` 序列（真实标题 `A%41B` → URL `%2541B` → 解出 `A%41B` → 循环再解 → `AAB`），会被多解一层损坏文案。无死循环风险（有上限 3 + 相等 break）。
- 修复：上限收敛到 2 次，或按来源路由名精确解码一次，并补注释。

## Minor（可选）

- `publish-contract.js:36`：`baijiahao` 缺 `titleMax` 字段，`getPlatformContentLimit('baijiahao')` 返回 `titleMax: undefined`，`PlatformOverridePanel` 不显示标题上限提示且 `maxlength` 不生效。
- `usePublishFlow.js:422-439`：存在两个 `cancelPublish` 函数定义（第二个覆盖第一个，第一段死代码）。
- `publish-contract.test.js:121`：`getPlatformContentLimit('baijiahao')` 测试未验证 `titleMax` 字段存在性。

## 结论

单平台 baijiahao 一键发布主场景可靠、测试充分，可放行该主场景；但 Critical C1/C2 应在合入前补齐「截断后重新校验」与「override 路径截断」，否则多平台/差异化发布会出现静默超限或无效截断。
