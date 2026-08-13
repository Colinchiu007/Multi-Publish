# 多语言术语词典（i18n-glossary）

> i18n-content-sync L3：产品名词的 zh/en 翻译集中维护。修改任一术语时，zh/en 两侧文案必须同步更新，
> 由 `apps/desktop/src/i18n/glossary.test.js` 自动校验（术语在 zh/en locale 文案中的出现状态必须一致，
> 防止「只改了中文没改英文」）。机器 ID 为稳定标识，**不得改名**。

| zh | en | 机器 ID（稳定，不改名） |
|----|----|--------------------------|
| 全能创作 | Omni Creation | `story2video-compose` |
| 启动流水线 | Start pipeline | — |
| 口播视频 | Talking Head | `talking-head` |
| 数字人口播 | Avatar Spokesperson | `avatar-spokesperson` |
| 旁白 | Narration | — |

## 维护规则

1. 新术语：先在本表登记，再在 `apps/desktop/src/locales/zh.js` 与 `en.js` 成对加入文案。
2. 改术语：只改本表 + locales 两侧；glossary.test.js 会在 zh/en 出现状态不一致时失败。
3. 术语出现状态 = 该词是否出现在对应 locale 文件的任一字符串值中（子串匹配）。
4. 机器 ID 只作为内部标识（IPC/配置/历史数据），外显名称一律走 locale。

## 视频生成模式术语边界（2026-08-13）

> 用于区分「旁白式」与「口播式」，避免 UI/文案混用。下列分析性术语**不作为登记条目**：
> locales 中无对应文案时不得登记（登记即触发 glossary.test.js 状态校验），需成为 UI 文案时先成对加入 locales。

- **旁白式**（对应流水线 `story2video-compose`，外显「全能创作」）：画面无说话人，TTS 人声为画外解说（Narration），文案角色 = 解说词。
- **口播式**（`talking_head` 类别，外显「口播视频」/「数字人口播」）：画面有说话人（真人视频或数字人），文案角色 = 口播台词。
- 两者共享 TTS 人声能力，但成片语义不同：旁白 = voice-over；口播 = 人物出镜说话。
- 若需新增「旁白式」「口播式」「图片轮播」等 UI 文案：先在本表登记，并同步 `zh.js` / `en.js` 成对加入。
