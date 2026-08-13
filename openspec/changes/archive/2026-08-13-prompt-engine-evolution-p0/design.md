## Design — prompt-engine-evolution-p0（反馈管道）

> 完整架构参考 `01-docs/prompt-engine-evolution-design.md`（v2，已合入 main）。本 design 只承载 P0 可执行细节。

### 决策记录

| 决策 | 选择 | 备选与理由 |
|---|---|---|
| 日志格式 | JSONL append-only，月轮转 | 无索引、顺序读友好；SQLite 需要 schema 迁移与并发写管理，P0 不需要查询能力 |
| 双日志 vs 单日志 | generation-log + feedback-log 双文件，eventId join | 双模型审查 C1：append-only 与异步回填矛盾 → 主记录不写 feedback 字段 |
| 写入方式 | `fs.appendFileSync` 单 writer | 主进程唯一写者；失败 catch+warn |
| 脱敏 | userHash = HMAC-SHA256(userId, salt)，含盐 | 双模型审查：低熵 userId 明文哈希可被彩虹表还原 |
| eventId 生成 | `crypto.randomUUID()` | 无碰撞、可 join |
| 采集开关 | config `evolution.collection` 三态 | 停写/停上报分离 |

### 模块结构

```
apps/desktop/electron/services/prompt-evolution/
├── schema.js              # GenerationEvent/FeedbackEvent 常量、枚举、validate()
├── signal-collector.js    # createSignalCollector({ logDir, config, log })
│                           #   recordGeneration(event), recordFeedback(feedback),
│                           #   getStats({engine}), 轮转与孤儿检测
├── signal-collector.test.js
├── stats.test.js
apps/desktop/electron/ipc-handlers/generation-feedback.js  # 注册 generation:feedback
apps/desktop/electron/ipc-handlers/generation-feedback.test.js
```

### 关键契约

- `recordGeneration(event)`：校验 → 追加 `generation-log/YYYY-MM.jsonl` → 返回 `{ ok, id }`；失败 `{ ok:false, error }` 不抛。
- `recordFeedback({ eventId, type, detail })`：校验 eventId 必传 + type 枚举 → 追加 `feedback-log/YYYY-MM.jsonl` → 孤儿检测（扫描当月 generation-log 的 id 集合）→ 返回 `{ ok, orphan }`。
- `getStats({ engine })`：读当月 generation-log + feedback-log，聚合 acceptRate/regenerateRate/avgDurationMs。
- IPC `generation:feedback`：入参纯 JSON 校验（eventId 非空、type 枚举），EC 错误码返回；`prompt-library:list` P0 返回骨架（空列表 + code 0）。
- 集成：`container.setup.js` feature flag `evolution.enabled`（默认 false，埋点不生效）；`history-prompt.ts` 增加可选 `onEvent` 参数（不传则行为不变）。
- 前端埋点：Story2Video 结果页在采纳/重新生成/编辑/下载操作处调用 `window.electronAPI.generationFeedback(...)`（feature flag 开启且存在 API 时），缺失时静默跳过。

### 风险与回退

- 日志目录权限/磁盘满 → 采集失败不影响生成（catch+warn）；`evolution.collection=muted` 一键停写。
- IPC 未注册（旧 preload）→ 前端调用不存在 API 时静默跳过（现有 electronAPI fallback 模式）。
- 测试污染 → 全部测试用 `os.tmpdir()/prompt-evolution-<pid>-<rand>` 唯一路径，teardown 清理。
