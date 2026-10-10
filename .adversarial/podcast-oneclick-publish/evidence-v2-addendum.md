# v2 可实现性附录（第 2 轮复核期间取证，待折入 proposal-v3 / PRD）

生成时间：2026-10-10 · 取证方式：直接读仓源码 + 测试夹具，非推断
本文件的存在理由：critic 正在读 `proposal-v2.md`，此刻不得修改被评审对象（本会话已因"评审读取中挪走文档"犯过一次顺序错误）。

## A1. 不变量 4 的"三处一致"确实有落地机制（v2 写法成立）

`apps/desktop/electron/services/podcast-hosting-upload.js:201-226` 的 `putObject`：

- `:205` `const size = fs.statSync(filePath).size` —— **打开文件时**实测字节
- `:207` `finalHeaders = { ...headers, 'Content-Length': String(size) }` —— 出站头就是这份实测值
- `:226` `return { status, size }` —— **返回值已带 size**，无需新增出站探测
- `:218-224` 非 2xx 一律抛 `PODCAST_HOSTING_UPLOAD_FAILED(<status>)` 并附 `err.status`

⇒ 一键路径可比对：**ffprobe `sizeBytes`（probe 步） == `putObject` 返回的 `size`（PUT 时 stat） == 实际写进 `Content-Length` 的值**。三者同源不同时刻，正是"文件在装配后被改动/被截断"这一类缺陷的检测点。

**边界必须写清（v2 已写，此处补证据）**：这条链证明的是"我发出去的就是那串字节"，**不证明** OSS 落库后仍是那串字节（存储侧损坏）。后者唯一途径是 HEAD/GET 读回，受"缺省不注入 `headImpl`（`podcast-channel-service.js:120`）+ 测试零出站"两条既有约束，故默认路径**如实不覆盖**，归入注入才跑的巡检。不得把这条写成已闭合。

## A2. degraded 判据确实是主进程可消费的持久化字段（v2 的修法不是空想）

`audioMeta.degraded` 不是渲染层现算的显示值，而是**落进项目持久化数据**的资产元信息：

- `story2video-project-service.js:965` / `:1107` / `:1192` 持久化 `safeAssetMeta(segment.audioMeta)`
- `:1770` / `:1818` 合成与重试成功后写入 `segment.audioMeta = safeAssetMeta(...)`
- `story2video-compose-engine.js:446` 产出侧 `audioMeta: scene?.audioMeta || sound?.meta || null`
- 真实形态见测试夹具 `{ source: 'ffmpeg-silence', degraded: true, format: 'mp3' }`（`story2video-project-service.test.js:535`、`story2video-compose-engine.test.js:167`）

⇒ 一键管线可在主进程读同一份项目快照的 `segments[].audioMeta.degraded`，与渲染层 `ResultView.vue:648-657` 的 `degradedAssetKinds` **同源同判据**；渲染层那条提示（`:884-888`）只是显示，不构成防线。

**落地约束两条（写进 PRD）**：
1. 读取必须过 `safeAssetMeta` 的既有形态收口，禁止在播客侧另写一份"什么算 degraded"的判据（单一口径纪律）。
2. `source: 'ffmpeg-silence'` 是 provenance 字段，可用于日志指名"静音占位来自哪一步"，但**判据只认 `degraded === true`**，不得拿 source 字符串当第二判据（否则新增静音来源即漏防）。

## A3. 由此新发现的一个小口径缺口（待 PRD 定）

外链单集（刀 2 手工路径）没有项目快照，因而**没有 degraded 概念**——它的风险形态是"用户手填的 sizeBytes 与真实对象不符"。v2 已把不变量 4 限定为一键产出，但 PRD 需要明确：手工路径的 `sizeBytes` 属**用户申报值**，界面措辞不得写成"实测"，以免与一键路径共用同一句提示却含义不同。
