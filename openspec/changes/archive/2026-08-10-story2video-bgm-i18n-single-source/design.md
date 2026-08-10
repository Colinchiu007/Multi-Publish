# Design: story2video-bgm-i18n-single-source

## 1. 服务层 warnings 机器码化

`BGM_SKIP_WARNING_MESSAGES`（中文对象）→ `BGM_SKIP_WARNING_CODES`：

```
bgm_size_exceeded / bgm_format_unsupported / bgm_not_allowed / bgm_unreadable
```

`composeWarnings.push(...)` 两处（入口校验失败降级、混音期复核降级）改为 push 机器码字符串。`data.warnings` 仍为数组（契约形状不变，内容由中文 → 机器码）；renderer 一律以 `bgmSkippedReason` + 前端 `bgmSkippedReasonText` 本地化，不读 warnings 文本。注释写明单一来源约定。

## 2. 测试更新

compose-engine.test.js 的 warnings 断言：
- `/BGM/` → `includes('bgm_unreadable')`
- `/超过大小上限/` → `includes('bgm_size_exceeded')`
- `/不可读/` 反向断言 → 改为不含中文/含 bgm_unreadable

## 3. 规格 delta（story2video-bgm-reuse）

MODIFIED Requirement「BGM 降级区分原因」：data 携带 `bgmSkippedReason` 机器可读码与 `warnings`（机器码数组，不含用户可见文案）；用户可见文案由前端依 reason 本地化。
