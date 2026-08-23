# Story2Video 长成片超时与通知映射审查

## 结论

- 最终双路独立复审：0 Critical。
- 初审发现的 Critical（Node `execFile` 超时可能只有 `killed=true`、`signal=SIGTERM`，renderer 文本匹配会漏判）已在主进程执行边界归一为阶段化 `ETIMEDOUT`，并补回归测试。
- 英文通知覆盖 Warning 已修复：总时长、单段时长、合成超时三个稳定消息键均有中英文测试。

## Warning 裁决

1. `execFfmpegStage()` 包装层目前通过判定/归一化 helper 的单元测试保护，未增加真实超时子进程集成测试。当前所有目标阶段均已统一经过包装器；记为低风险覆盖缺口，不阻塞本次交付。
2. 无法获得媒体时长时回退阶段最小预算，长媒体在 probe 失败时仍可能预算偏小。该行为是 OpenSpec 明确的安全回退合同，避免用不可信时长放大等待，不在本次改动中改变。

## Fresh 证据

- `node --check electron/services/story2video-compose-engine.js`：PASS。
- 定向 Vitest：3 文件、161/161 PASS。
- locale CJK/pair、OpenSpec strict validate、worktree dependencies：PASS。
- renderer build：PASS。
- Windows `electron-builder --win --x64 --publish never`：exit 0。
- ASAR 包含 `electron/services/story2video-compose-engine.js`，提取后真实 require 成功。
- 打包应用启动 8 秒存活，stderr 为空，未出现配置、PluginLoader、ASAR 路径或 updater 网络栈。

## 门禁结论

APPROVE。0 Critical；已修 Warning 无遗留阻塞项。
