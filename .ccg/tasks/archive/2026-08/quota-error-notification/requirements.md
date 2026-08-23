# 需求

供应商返回 `GoUsageLimitError`、`5-hour usage limit reached` 等明确用量上限错误时，桌面端必须提示用户模型账号额度/用量窗口已耗尽；普通 RPM/短时 429 仍显示限流提示。流水线历史错误和结果页手动重新生成图片提示词必须使用同一套分类，且保留 zh/en 文案成对同步。

验收标准：

- `GoUsageLimitError`、`5-hour usage limit reached`、`usage limit reached` 映射到 `story2video.quota_exceeded`。
- 普通 `429 Too Many Requests`、`rpm exhausted` 仍映射到 `story2video.rate_limited`。
- 手动重新生成图片/视频提示词遇到额度错误时不再固定为泛化失败文案。
- 回归测试覆盖流水线格式化、通知格式化和手动路径可复用的统一分类行为。
