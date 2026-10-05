---
record: bilibili-bvid-extract
task: B 站发布侧作品标识（aid/bvid）采集修复——发布成功判定与审核回查的前置条件
date: 2026-10-06
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；远端分支也未删除
sync_backfill_owner: 下一个会话（docs-only 回填 PR，回填即删除本段三个 sync_* 字段）
---

## 本次执行记录：B 站发布侧作品标识（aid/bvid）采集修复（bilibili-bvid-extract，2026-10-06）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码在隔离 worktree `D:/Data/projects/mp-worktrees/mp-bilibili-bvid-extract`，裸分支 `bilibili-bvid-extract`（start-mp-task.ps1 建区）；`verify-worktree-deps` OK；共享根保持 main、未落任何运行时代码 |
| 第一性原因（QM-5 ①） | PASS | `57082ddec`（2026-08-24 "unify QR login tabs and harden publish evidence"）写下路径段关键词表 `post\|article\|media\|content\|clue\|work`，只覆盖图文/管理页形态；`d424c245c`（2026-09-29）把纯函数拆到 `rpa-publish-id-extract.js` 时原样搬迁。当时意图是修图文平台，**从未对 B 站发布链路取证**；隐患是同一模块内两处口径不对称——查询键表含 `video`、路径段表不含，读起来像"视频形态已覆盖" |
| 逃逸分析（QM-5 ②） | PASS | 单元层：`extractPublishIdFromUrl` 此前**无任何行为测试**，用例只寄生在 `rpa-view-platforms.test.js` 的源码结构锁里，而那些锁只喂图文形态 ⇒ 对 B 站结构性免疫；集成层：`finish()` 的用例注入的是 `https://example.com/post/1` 这类假 URL，恰好命中通用表；真机层：B 站 RPA 投稿从未跑通（本机发布历史 9 份库实测 0 行）。分类＝**无测试 + 测试不执行**。修复前后直接调用被测函数实测：四条 B 站形态全部 null，两条正控（`article_id`、`video_id`）正常命中 ⇒ 证明探针有效、null 不是夹具失效 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增按**值形态 + 主机**的正向判据（`BV…`/`av\d+`、query 的 `bvid`/`aid` 须值合形态、响应体链须带 B 站端点上下文），通用判据一律不动。回归锁两级：`rpa-publish-id-extract.test.js` 12 例（含 A5/A6/A7/A4b 负例）+ `rpa-view-platforms.test.js` 3 条**装配锁**（作品页 URL 承载 / 停在投稿页时由证据承载 / 两者皆无必须判失败），后者 73/73 绿；全量 `vitest run electron` 8629 passed / 1 failed（唯一红＝既有 `feedback.test.js` 的 Windows `fs.symlinkSync` EPERM，该文件不 require 被测模块，`git grep` 命中 0） |
| 防止再次发生（QM-5 ⑤） | PASS | ①该模块首次获得独立行为测试文件（由 vitest `include: electron/services/**/*.test.js` 收集，非手工接线）；②「裸加 `video` 关键词」这一最容易被后人采纳的错修法被 A5 + 装配负控两条锁钉住，且变异实跑证明它们真会红；③模块头注释登记"本模块现含平台专属判据 + 收敛条件"，PRD §七列明后续项（平台规则表 / 抖音快手微博响应体取证 / 真机端到端） |
| 行尾与 diff 对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 逐文件相等（被测模块 41/17、新测试 22/3、`rpa-view-platforms.js` 1/1、消费者测试 43/0、PRD 42/1、记录与本文件、账本 2/1）；两个 `*.bundle.js` 的 M-with-empty-diff 索引假象用 `git checkout HEAD -- <精确文件>` 清掉，未进提交 |
| 接线棘轮 | PASS | 新测试文件由 workspace vitest `include` 收集（`check-unwired-tests.js` 的域不含 vitest workspace，但本文件被全量实跑过并出现在通过清单）；本记录文件即 PR 执行记录载体（`check-pr-exec-record.js --mode=enforce`） |
| QM-1 打包 / QM-4 视觉 | PASS / N/A | `pnpm run build:dir` rc=0；asar `extractFile` 断言产物内 `rpa-publish-id-extract.js` 8385 字节、`endpoint_gate=true`、`host_gate_off=false`（提交的是评审后版本）、`path_table_has_video=false`；隔离 profile 启动本树 4 进程存活 10 秒、stderr 空、无 QM-1 禁止特征，并断言未影响其他会话实例。视觉：零 UI/样式变更 ⇒ N/A |
| QM-6 CCG 双模型外部评审 | PASS | **通道偏差声明**：primary 前端 claude 静默空转（rc=2、`completed without agent_message output`、无产物）⇒ 按既有替代通道降级 opencode 免费模型两路（后端 nemotron-3-ultra-free、前端 ling-3.1-flash-free，产物 `.ccg/qm6-bvid-{backend,frontend}-findings.json`）；primary 后端 codex 的 `exec` 工具仍报 `missing field cmd`，结论落 stdout（`p33-qm6-backend.log`）。评审绑 commit `6a534bd82`，**三通道独立命中同一条 Critical**：响应体链的 `aid`/`bvid` 无主机门 ⇒ 非 B 站 2xx 发布响应里的数字 `aid` 会被采成 postId（strict 平台快手/百家号受影响最重，其 postId 唯一主来源正是该证据链），把失败判成成功。**处置**：Critical 已修 + 新增 A4b 负例；4 条 Warning 已修（判据整体后置、`pickBilibiliWorkId` 按形态择优与参数顺序无关、两条链同形、补消费者装配锁、变异留痕）；可扩展性建议（平台规则表）评估后不取并登记后续项；Info 条确认主机锚定、无双重放行、无未观测写成已验证、无凭证/日志新增面 |
| 远程同步 | PENDING | PR 合并后回填 merge SHA 与远端分支删除证据，并删除本文件 frontmatter 的 `sync_status` / `sync_reason` / `sync_backfill_owner` 三字段 |

### 遗留（不假装已闭合）

- **本条自身的远程同步**：由后续 docs-only PR 回填并删除三个 sync_* 字段。
- **真机端到端未观测**：B 站投稿提交成功后浏览器实际落在哪个 URL 未取证（发布历史 0 行，无从取证）。
  本修复把三种合理承载（作品页 URL / query 参数 / 提交响应体）一次补齐，**不等于**已现场命中某一条；
  端到端确认需一次真实投稿，B 站曝光模型与「仅自己可见」不同，消耗授权前必须再次经用户确认。
- **抖音 / 快手 / 微博发布端点的响应体键集未取证**：主机门已把误判面闭合到只对 bilibili 生效，
  取证属加固项（PRD §六.4）。
- **未观测的 B 站审核状态取值**沿用上一轮结论，仍不进 `AUDIT_REQUERY_VERIFIED_PLATFORMS`。
- 后续项：第 2 个平台需要"专属键名 + 值形态"判据时，把分支收敛成平台规则表，勿再抄一份。
