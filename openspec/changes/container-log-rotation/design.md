## Context

审计 C3（容器默认 json-file 无 rotation）。本 change 为 compose 服务的容器级日志驱动统一加轮转，避免宿主磁盘被日志占满。

规格契约见 `openspec/changes/container-log-rotation/specs/container-log-rotation/spec.md`（R1）。

## Goals / Non-Goals

**Goals:**
- publish-api / logto / postgres / 监控容器统一 json-file + max-size 50m + max-file 5（R1）
- 契约测试断言（logto-deploy-contract.test.js）

**Non-Goals:**
- 不引入 Loki/ELK 等集中日志采集（P2 后续项）
- 不改容器内应用自身的日志行为（应用侧已由前序 change 落地文件/保留策略）
- 不改 systemd 部署（ops-center 走 journald，已有宿主保留机制）

## Decisions

**D1: 统一 `json-file` + `max-size: 50m` + `max-file: 5`**
每个容器约保留 ≤250MB 日志。备选：不同服务不同上限（运维复杂度高，无必要）→ 拒绝。
注：json-file 默认 driver 也需显式声明 options（Docker 默认无轮转）。

**D2: 契约断言集中在 logto-deploy-contract.test.js**
该文件已解析 logto + api 两个 compose；monitoring compose 单独断言。备选：新测试文件（分散）→ 拒绝。

## Risks / Trade-offs

- [max-file 截断丢弃旧日志] → 50m×5=250MB 对排障足够；如需更久留痕应上集中采集（Non-Goal）。
- [compose merge 影响 webhook-retry overlay] → overlay 不声明 logging，继承 base（compose 合并语义），无需改动。

## Migration Plan

- 单 PR；合并后 `docker compose up -d` 重建容器即生效；回滚 = revert。

## Open Questions

无。
