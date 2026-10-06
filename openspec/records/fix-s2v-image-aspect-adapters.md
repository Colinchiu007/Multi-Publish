---
record: fix-s2v-image-aspect-adapters
task: 修掉 Story2Video 竖屏成片配横图的画幅断链——把画幅解析收敛到单一真源，让全部图片适配器（含图库检索型）都按成片画幅出图，并把枚举式契约锁升级为穷举式
date: 2026-10-06
---

## 本次执行记录：Story2Video 竖屏出图画幅断链修复（fix-s2v-image-aspect-adapters，2026-10-06）

> 现象来源：用户报「视频创作 → 故事讲述」分辨率选 720x1280，成片确为竖屏，
> 但生成的图片是横屏，画面没充满（项目 ID `mur2tzc8_ru1r`）。
>
> **这是同一现象的第二次修复**。前序 `fix-s2v-portrait-image-aspect`（PR #2787，2026-10-02）
> 已修过同一个项目、同一个现象，但只覆盖了 1 个图片适配器，换 Provider 即复现。
> 本次的价值不在「又修了一个适配器」，而在**把画幅契约收敛到单一真源 + 把契约锁从枚举式
> 升级为穷举式**——让「第 N 个适配器」不再可能悄悄逃逸。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（`apps/desktop/**`）在隔离 worktree `/workspace/mp-worktrees/mp-fix-s2v-image-aspect-adapters`、裸分支 `fix-s2v-image-aspect-adapters`；共享主工作区 `/workspace/mulpub` 保持 `main` 且未 checkout |
| 第一性原因（QM-5 ①） | PASS | 画幅在「输出分辨率 → 出图尺寸」链上**无单一真源**，每个适配器各自决定读哪个键；`asset-generator.generateImage`（asset-generator.js:528-541）虽同时下发 `aspect_ratio` 与由它换算的 `width/height`，但只消费其中一条的适配器在另一条缺失时静默退回供应商默认。真正断链者：`recraft`（只读 `size`，两套契约都不消费 → 恒 1024x1024 方图）、`grok-image`（两套都不发）、`pexels`/`pixabay`（图库检索不带 `orientation`）、`comfyui`（尺寸在 workflow 图，适配器无生效路径）。详见 `01-docs/PRD-STORY2VIDEO-PORTRAIT-IMAGE-ASPECT-2026-10-06.md` §3 |
| 逃逸分析（QM-5 ②） | PASS | ① 适配器单测只有 agnes 有竖屏行为断言；② 契约锁是**枚举式白名单**（逐个点名），新增适配器不在名单内不会红；③ 端到端无跨 Provider 画幅一致性断言，且 compose 层 `pad` 兜底把比例错误掩盖成「能出片」；④ code review 发生在单适配器 diff 上，看不到同类集体缺失。PRD §3.5 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `_base/aspect-ratio.js` 单一真源（读/解析/翻译三合一）；`recraft`/`grok-image`/`pexels`/`pixabay` 行为修复；`agnes-image`/`minimax-image`/`imagen` 等价收敛；`openai-image`/`flux`/`local-diffusion` 补画幅键为次级兜底；流水线层 `resolveAspectRatio` 改为按分辨率推导；`startExplainerPipeline` 补下发画幅。回归锁：`_base/aspect-ratio.test.js`（22）、`image-adapter-aspect-contract.test.js`（23，**穷举式**）、`image-aspect-ratio-portrait-regression.test.js`（8 适配器行为锁）、`story2video-stages-aspect-ratio.test.js`（15）、`CreateView.test.js`（2，渲染层）。**实测 adapters 全量 64 文件 / 1672 用例通过；story2video-stages 242 用例通过（含既有 154）；CreateView.test.js 288/288 通过（含新增渲染层 2 例）** |
| 防止再次发生（QM-5 ⑤） | PASS | ① 单一真源：新增适配器必须经 `readAspectRatio`，结构锁第 7 条禁止自研 `params.aspect_ratio \|\| ...`；② **穷举式契约锁**：动态扫描目录找所有 `async generateImage(`，漏消费即红，并断言「扫描结果非空」防规则失效空转；③ 豁免显式化：`EXEMPT_ADAPTERS` 每条必须写理由、理由为空即红、不得包含已消费画幅的适配器、文件必须存在；④ 纵深防御：上游漏传画幅时按输出分辨率推导，不再写死 16:9；⑤ 校验层与运行时层共用 `deriveStory2VideoAspectRatio`，杜绝两处真相 |
| 行尾与 diff 对账 | PASS | 见「远程同步」上方各提交前 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐文件相等（提交时核验） |
| 接线棘轮 | PASS | 4 个新增 `*.test.js` 均落在既有 `include` 覆盖范围：`electron/services/**`（vitest.config.js include）与 `src/**`（同 include），无需改 CI |
| QM-1 打包 | 未执行（如实登记） | 本会话运行在云沙箱，无 Electron 运行时与完整 monorepo 依赖（`pnpm install` 因网络 10–20s/请求未能完成），`electron-builder` 无法执行。**留待 CI 与本地复核** |
| QM-4 视觉 | PASS（判定不触发） | 唯一 UI 侧改动是 `CreateView.vue` 中 `startExplainerPipeline` 的**提交参数新增一个字段**（`aspectRatio`），不触碰任何模板/样式/交互元素，无像素级外观变化 |
| locale 成对（Gate 7） | PASS | `locales/zh.js` / `en.js` 零改动：本次**不新增任何用户可见文案**（理由见 PRD §7.3：未加「画幅不符」告警是刻意取舍，已登记为缺口） |
| QM-6 CCG 双模型外部评审 | 未执行（如实登记） | 本会话无 `codeagent-wrapper` / codeagent 通道，不以自审冒充通过。评审需求已写进 PRD 与本记录，供具备通道的后续会话补跑 |
| 远程同步 | PASS | PR #2980 已 squash 合并：merge SHA `422cee8b6c4250bd1594435f520de792a04e7c4d`，合并时间 `2026-10-06T13:31:13+08:00`；`git ls-remote --heads origin fix-s2v-image-aspect-adapters` 返回 0 行，证远端分支已删；本条与 `.quality-gates.md` 的「远程同步」行、ledger 登记项在同一次提交（backfill-2980-record）内收口 |

### 遗留（不假装已闭合）

- **comfyui 出图比例未修**：尺寸写在用户自备 workflow 图的 `EmptyLatentImage` 节点里，
  适配器下发画幅无生效路径。已进 `EXEMPT_ADAPTERS` 并写明风险与待办。
  **使用 comfyui 作为图片 Provider 时，竖屏成片仍可能出横图**——这是本次刻意不修的已知缺口，不是遗漏。
- **未加运行期「出图画幅 ≠ 成片画幅」告警**：验证需读图片真实像素，会引入图片解码依赖与额外失败分支；
  代价是「Provider 静默忽略画幅」只能在测试期发现。已评估为本期不做并登记（PRD §8.4 第 2 条）。
- **前序 PRD §2.4 供应商矩阵已被本 PRD §3.3 更正**：其中 `recraft` 一行原判为
  「只读 `params.size`……因上游文档抓取超时，登记观察项、不盲改」——实际**不需要上游文档即可
  判定断链**（该适配器自身默认 `size` 即方图，而 asset-generator 从不发 `size`）。
  「不敢改 → 留着坑」的代价已记录，旧 PRD 保留原文不改写，仅由本 PRD 更正并交叉引用。
- **QM-1 打包与 QM-6 双模型评审未执行**（原因见上表），CI 与后续具备通道的会话需补。
