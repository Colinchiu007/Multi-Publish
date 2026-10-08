---
record: docs-ops-manual-resilience
task: 部署手册（docs/ops-center-ecs-deployment.md）新增 §10 韧性链路运维——外部探针 / 生效回执 / 断连遥测
date: 2026-10-08
sync_reason: PR 已开、CI 进行中，远程同步行写 PENDING；合并后在同一次提交内改写为 PASS + merge SHA 并删除本 frontmatter 的 sync_reason / sync_backfill_owner 字段
sync_backfill_owner: agent（本 PR 自动合并后回填）
---

## 本次执行记录：部署手册补韧性运维章节（docs-ops-manual-resilience，2026-10-08）【docs-only】

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离声明 | PASS | 纯文档（`docs/` 1 个 `.md`，+77/-3）。编辑时主工作区可能被他session占用，全程在临时隔离 worktree（`D:\Temp\mp-ops-manual`）提交推送 |
| 行尾对账 | PASS | `git diff --numstat origin/main HEAD` 与 `--ignore-cr-at-eol --numstat` 口径一致（77/3） |
| 门禁脚本 | PASS | `classify-docs-only.js` → docs-only=true files=1；`check-no-brand-residue.js` rc=0（随 pre-commit 全仓扫描）；编码自检无 U+FFFD（244 行） |
| QM-1/QM-4 | N/A | 纯文档 |
| QM-6 双模型评审 | N/A | docs-only 豁免；手册内容全部为已合入代码（PR #3126）的可观测事实 + 通用云监控配置建议，无新设计决策 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(<PR>)$' --format=%H\|%cI` 回填 PASS 并删 sync_* 字段，同一次提交 |

### 内容来源（全部可溯源）

- §10.1 外部探针：来源 = 本方案 §5.3「断连告警不能依赖被监控的同一通道」+ `ops-center/backend/routers/telemetry.py` 模块 docstring（明文写着「必须由运营中心之外的探针警告」）；`/health` 与 `/api/v1/system/health` 端点经 `ops-center/backend/main.py:36`、`routers/health.py:5` 核实
- §10.2 四端点鉴权：`routers/telemetry.py:22-41`（`_require_client_key` = Bearer 或 X-Catalog-Key）、`routers/runtime.py:143,157`（ack 同鉴权；rollout `require_admin`）、`telemetry.py:41-51`（summary `require_admin`）；`config_version`/`config_hash` 出处 `services/config_fingerprint.py:37`、`services/runtime_service.py:42,46`
- §8 排障表三条「这不是故障」：`entitlement-service.js:10`（`ENTITLEMENT_GRACE_SECONDS = 72*60*60`）、`ops-runtime-snapshot.js:40`（`SNAPSHOT_SETTING_KEY`）、seed 日志关键字 `runtime-hydrated-from-seed`（PR #3126 QM-1 打包证据，见 `openspec/records/ops-center-resilience-impl.md`）
- §7.5 Fake-IP 局限：本会话 2026-10-08 实测（`Resolve-DnsName` 经 223.5.5.5 两域名均解析 198.18.x）
