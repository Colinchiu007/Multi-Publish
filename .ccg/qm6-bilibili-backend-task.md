# QM-6 后端评审任务书（bilibili-audit-evidence）

对 commit `734d7551e`（分支 xhs-audit-evidence，基线 refs/remotes/origin/main）做**后端方向**审查：正确性 / 边界 / 安全 / 规格合规。

## 变更范围（只审这些）

1. `apps/desktop/electron/services/bilibili-audit-check.js`（新增，110 行）
2. `apps/desktop/electron/services/publish-monitor.js`（改动：CHECK_URLS.bilibili + checkPublishStatus 分流 + opts.axios 注入）
3. `apps/desktop/electron/services/bilibili-audit-check.test.js`、`apps/desktop/electron/services/publish-audit-requery.test.js`（测试）
4. `docs/audit-requery-evidence-bilibili-2026-10-05.md`（取证文档，判断实现是否与证据一致）

用 `git diff refs/remotes/origin/main..734d7551e -- <path>` 看精确 diff。

## 背景（实现依据的实测证据）

- 真端点：`GET https://member.bilibili.com/x/web/archives?status=pubed&pn=1&ps=20&platform=web`，Cookie 会话鉴权，无签名/OAuth。
- 条目在 `data.arc_audits[]`（`data.archives` 是空对象）；标识符 `bvid` / `aid`（15 位 int，须 String 化比较）。
- 只观测到 `state=0 && primary_state=0` ⇒ 已发布；**审核中/不通过的 state 值未观测**（无定论），所以设计为「未观测状态一律 pending，不猜」。
- 历史背景：发布历史里存的 postId 可能是 bvid（我们的发布侧没捕获 bvid，见 docs §四）——匹配不到时返回 pending 而不是 error。

## 审查重点

1. `checkBilibiliAuditStatus` 的判定表是否与文档 §一/§二 一致；有没有把「无定论」误判成「已发布/失败」的路径（尤其 `Number(null)===0` 这类类型强制——已修为严格 typeof，请验证是否还有残余）。
2. `aid` 比较用 `String(aid)===String(postId)`：大整数在 axios JSON.parse 下是否可能精度丢失（15 位在 Number.MAX_SAFE_INTEGER 边界）？
3. 错误路径：nav 失败 / list code!==0 / throw 是否都能收敛到 pending 或 error，不冒泡到 IPC。
4. Cookie 处理：日志是否可能泄 Cookie 值；headers 组装是否会把 SESSDATA 发到非 B 站域。
5. `opts.axios` 注入模式与 publish-monitor 既有平台分支的一致性；会不会破坏既有平台的调用点。
6. 测试质量：14 例是否真锁住行为（变异反证已跑 4 条），有没有断言恒真的夹具。

## 输出要求（硬性）

- **把 findings 写入文件** `.ccg/qm6-bilibili-backend-findings.json`（本 worktree 内），JSON 格式：
  `{"model":"<你的模型名>","direction":"backend","findings":[{"severity":"Critical|Warning|Info","file":"<相对路径>","line":"<行号或区间>","desc":"<问题>","fix":"<建议>"}],"verdict":"pass|block"}`
- 最后一行 stdout 只打印 `FINDINGS_WRITTEN <条数>`。
- 不修改任何被审文件；只读 + 写 findings 文件。
