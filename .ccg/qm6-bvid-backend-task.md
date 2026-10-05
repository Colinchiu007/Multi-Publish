# QM-6 后端评审任务书（正确性 / 边界 / 安全 / 规格合规）

被审对象：worktree `D:/Data/projects/mp-worktrees/mp-bilibili-bvid-extract`，commit `6a534bd8292df31970a6471d3e83b70c7a8818ec`
diff 文件：`.ccg/bvid-impl.diff`（同目录）
规格：`docs/PRD-BILIBILI-PUBLISH-ID-EXTRACT-2026-10-06.md`
被测模块：`apps/desktop/electron/services/rpa-publish-id-extract.js`
新测试：`apps/desktop/electron/services/rpa-publish-id-extract.test.js`
消费方：`rpa-view-platforms.js:757-791`（`finish()` 用 postId 判发布成败）、`rpa-view-artifacts.js`、`rpa-view-navigation-helpers.js`
下游：`bilibili-audit-check.js:44`（按 `String(archive.bvid)===String(postId)` 精确比）

## 背景（一句话）
B 站 RPA 投稿成功后取不到作品 id ⇒ 发布被判失败，且已合并的审核回查永不被触发。本次新增「按值形态 + 主机限定」的正向判据。

## 必须逐条回答
1. `extractPublishIdFromUrl` 新增分支会不会让**非 B 站平台**的既有结论发生任何改变？（含 host 判定 `BILIBILI_HOST` 的正则是否会误命中子域/后缀，例如 `evil-bilibili.com`、`bilibili.com.evil.net`）
2. `collectPublishIds` 里新增的 `aid`/`bvid` 键规则**没有主机上下文**，是否会从其它平台的响应体里取到不该取的值，把失败判成成功？给出具体可利用的响应体样例并判定严重度。
3. 值形态判据（`^BV[0-9A-Za-z]{5,20}$`、`^av\d{4,}$`、`^\d{4,}$`）与 `normalizePublishId` 的长度/导航词约束是否存在互相矛盾或双重放行？
4. 路径段扫描 `parts.find(...)` 放在通用判据之后：是否存在「通用判据先返回了一个错值、B 站形态本可纠正」的真实形态？
5. 规格 §五 A1-A10 是否被测试逐条覆盖？特别检查 A5/A6/A7 这三条负例是否真的能抓住「把 video 裸加进关键词表」这种实现（若抓不住，指出测试怎么写才抓得住）。
6. 规格 §六 声明「投稿后实际落在哪个 URL 未经真机观测」。实现是否在任何地方把未观测事实写成已验证？（若文档有过度声明，指出具体句子）
7. 安全面：新增代码是否触碰凭证/日志泄漏（本仓纪律：日志禁止记录用户内容与凭证；`sanitizePublishResultUrl` 已存在）。

## 输出要求（硬性）
把结论**写入文件** `D:/Data/projects/mp-worktrees/mp-bilibili-bvid-extract/.ccg/qm6-bvid-backend-findings.json`，
JSON 数组，每项 `{"severity":"Critical|Warning|Info","file":"...","line":0,"issue":"...","fix":"...","evidence":"..."}`。
不得只在 stdout 输出；文件必须存在且非空。
