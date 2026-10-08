---
record: docs-ops-resilience-addendum
task: 回写架构文档实施状态（PR #3126 已合入）与 R1/R2 风险实测结论，纯文档增补
date: 2026-10-08
sync_reason: PR #3144 已开、CI 进行中，远程同步行写 PENDING；合并后在同一次提交内改写为 PASS + merge SHA 并删除本 frontmatter 的 sync_reason / sync_backfill_owner 字段
sync_backfill_owner: agent（PR #3144 自动合并后回填）
---

## 本次执行记录：架构文档增补（docs-ops-resilience-addendum，2026-10-08）【docs-only】

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离声明 | PASS | 纯文档（`01-docs/` 1 个 `.md`，+22/-3）。因另一会话正在共享主工作区活跃（`.quality-gates.md` 分钟级更新中），本次全程在临时隔离 worktree（`D:\Temp\mp-ops-doc-addendum`）操作，未触碰共享主目录 Git 状态 |
| 行尾对账 | PASS | `git diff --numstat origin/main HEAD` 与 `--ignore-cr-at-eol --numstat` 口径一致 |
| 门禁脚本 | PASS | `classify-docs-only.js` → docs-only=true files=1；`check-no-brand-residue.js` rc=0；文档编码自检无 U+FFFD |
| QM-1/QM-4/QM-6 | N/A | docs-only 豁免；事实核对均为只读探针与源码行号引用 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#3144)$' --format=%H\|%cI`（PR 号以实际为准）回填并删 sync_* 字段，与销账同一次提交 |

### 事实核对清单（全部只读）

- PR #3126 merge SHA `acfea7d398e582657e5489fbf6e851f052d53205`（gh pr view 实测）
- `entitlement-service.js:10` `ENTITLEMENT_GRACE_SECONDS = 72 * 60 * 60`（与方案 §4.7 一致）
- `ops-runtime-snapshot.js:40` `SNAPSHOT_SETTING_KEY = 'opsCenterRuntimeSnapshot'`；`:159-161` seed 剔除 word_list
- `config_fingerprint.py:37` `compute_config_hash`（13 块 SHA-256 前 16 位）；`runtime_service.py:46` `resolve_config_version`
- `telemetry.py:27` `POST /api/v1/telemetry/degradation`；`runtime.py:143` `POST /api/v1/runtime/ack`；`:157` `GET /api/v1/runtime/rollout`
- seed JSON：14 顶层字段、无 word_list、无 signature（ConvertFrom-Json 实测）
- 探针（2026-10-08）：`auth.iart.work/api/v1/me` → 401；`ops.iart.work` → TLS 握手失败；两域名经 223.5.5.5 解析均落在 198.18.x Fake-IP 网段（本机代理 DNS 接管，结论标注了局限）
