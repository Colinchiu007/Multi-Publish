# 多语言术语词典（i18n-glossary）

> i18n-content-sync L3：产品名词的 zh/en 翻译集中维护。修改任一术语时，zh/en 两侧文案必须同步更新，
> 由 `apps/desktop/src/i18n/glossary.test.js` 自动校验（术语在 zh/en locale 文案中的出现状态必须一致，
> 防止「只改了中文没改英文」）。机器 ID 为稳定标识，**不得改名**。

| zh | en | 机器 ID（稳定，不改名） |
|----|----|--------------------------|
| 全能创作 | Omni Creation | `story2video-compose` |
| 启动流水线 | Start pipeline | — |
| 视频克隆 | Video Clone | `video-clone` |
| 运营后台 | Ops Center | — |
| 模型设置 | Model Settings | — |
| 历史记录 | History | — |
| 发布历史 | Publish History | — |
| 提示词 | Prompt | — |
| 草稿箱 | Drafts | — |
| 流水线 | Pipeline | — |

## 维护规则

1. 新术语：先在本表登记，再在 `apps/desktop/src/locales/zh.js` 与 `en.js` 成对加入文案。
2. 改术语：只改本表 + locales 两侧；glossary.test.js 会在 zh/en 出现状态不一致时失败。
3. 术语出现状态 = 该词是否出现在对应 locale 文件的任一字符串值中（子串匹配）。
4. 机器 ID 只作为内部标识（IPC/配置/历史数据），外显名称一律走 locale。
