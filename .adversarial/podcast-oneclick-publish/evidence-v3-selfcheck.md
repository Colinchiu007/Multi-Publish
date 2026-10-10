# v3 前置取证：落盘层零校验导致的频道级连带失效（自查发现，非评审提出）

生成时间：2026-10-10 · 取证方式：读仓源码 + 全仓 grep 调用者
存在理由：critic 正在读 `proposal-v2.md` / `evidence-v2-addendum.md`，本轮不修改它已在读的文件，故另立此文件；v3 与 PRD 必须折入。

## 1. 实测事实链

| 断言 | 证据 |
|---|---|
| `saveEpisode` **不做单集校验** | `apps/desktop/electron/services/podcast-channel-service.js:271-275` 仅判"是不是对象"；`:296-298` 判 `ITEMS_MAX`；其余字段一律 `Object.assign` 落盘（`:288` / `:301` 写 `EPISODES_FILE`） |
| 服务**没有 import** `validateEpisode` / `validateEpisodeList` | `:27-31` 只引入 `validateChannel` / `buildFeed` / `parseFeed` / `verifyFeed` / `issue` |
| 全仓 `validateEpisode` 的调用者**只有引擎内部** | `grep -rn validateEpisode`（排除测试）命中仅 `packages/shared-utils/src/podcast-rss.js:179/:192` + 导出表 `:431-432` |
| 校验真正发生在 `buildFeed` | `podcast-rss.js:269` 第一件事是 `validateFeed(channel, episodes)`；`:192` → `validateEpisodeList` → `:179 validateEpisode`；不过则 `:271-275` 抛 `PODCAST_FEED_INVALID: <码列表>` |
| issue **能指名是哪一期** | `validateEpisode(raw, idx = 0)`（`:136`）由 `validateEpisodeList` 逐条传 `i`（`:179`），路径字段带序号 |

⇒ 我 v1/v2 §6 写的"输入层（`validateEpisode`）守手工路径"**位置写错了**：手工路径落盘时没有任何单集校验，第一道闸在构建期。

## 2. 由此暴露的频道级隐患（v2 未覆盖，必须进 v3）

1. **坏数据可被静默持久化**：非法单集能写进 `episodes.json`，直到某次 `buildFeed` 才失败——而失败发生在"生成 feed"这一步，不在"保存单集"这一步。
2. **连带失效范围是整个频道**：`validateEpisodeList` 校验的是全量列表。一条坏单集会让**该频道任何内容**的发布都构建失败，包括与它无关的新单集。
3. **与 D-3 幂等叠加会变成死循环**：一键失败后用户换个稿子再点，之前那条坏集仍在列表里；而对同一条内容重试走 `saveEpisode` 的 guid 原地合并（`:277-281`），坏字段不会被清掉 ⇒ 频道被永久卡死，且用户看不出为什么。
4. **界面若只透出一句 `PODCAST_FEED_INVALID` 就是不可排查**：错误信息里有码列表但没有"哪一期、哪个字段"的呈现，等于把定位工作丢回源码。

## 3. v3 必须落的三条修改（含验收锁）

- **M-1 写入前逐条校验**：一键路径在 `saveEpisode` **之前**调用引擎 `validateEpisode(episode, 0)`，不过即 fail closed、**不落盘**。禁止在播客侧另写一份字段判据（单一真源）。
  验收：行为锁「非法单集不落盘」+ 变异反证（摘掉预校验必须变红）。
- **M-2 构建失败必须可定位**：`PODCAST_FEED_INVALID` 向渲染层透出 `issues[]`（含带序号的字段路径），界面按"第 N 期 · 字段 · 码"逐条列出并给出跳转到该期的入口；文案不得只写"feed 校验失败"。
  验收：断言 issues 数组与界面清单**一一对应**（不是只断言出现错误码）。
- **M-3 阻断范围必须如实声明**：当列表内存在**与本内容无关的**历史非法单集时，界面明确说「该频道有 N 期不符合规范，导致本期无法发布，请先修正它们」并列出是哪些期——否则用户会以为是刚点的那份内容有问题，转而反复重试。
  验收：夹具必须预置"一条合法新集 + 一条历史坏集"，断言错误归因指向坏集而非新集（**这条正是本仓「夹具对所有输入返回同一份数据即结构性免疫」的同族要求**）。

## 4. 顺带一条口径修正（给 PRD）

`removeEpisode:316` 只按 `id` 删（`x.id !== key`），而 `saveEpisode` 允许按 `guid` 命中合并——手工路径与一键路径的"同一期"定义不同源。PRD 需明确：一键产物一律以 `id` 为删除键、`guid` 仅作聚合端去重身份，不得把 `guid` 当删除参数传入（否则删不掉）。
