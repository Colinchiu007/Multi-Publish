# Review: story2video-bgm-reuse-fix (Claude 独立审查)

- 后端：claude（codeagent-wrapper），antigravity 降级（`agy` 缺失 EXIT=127，2026-08-09 记录）。
- 结论：**Critical 0；有条件通过（approve with changes）**。

## 合入前已处理

- W1 `pipeline-engine.js:1108` 归一化失败分支同样删除 BGM（同 bug 类别残留）→ 已改为 `{ skipBgm: true }`。
- Info `story2video-compose-engine.js` 两个成功返回分支 data 形状不一致 → 兜底分支补齐 `bgmApplied/bgmSkipped/warnings`。
- Info `bgmSkipped` 由 warnings 长度推导脆弱 → 改为显式布尔位。
- Info `model-provider-manager.js` `safeJsonParse` 重复调用 → 提取局部变量一次解析。

## 记录为后续迭代（不阻塞合入）

- W2 `selected-media` 无引用式/老化 GC，BGM 只增不删 → 需引用/老化回收（tasks.md 后续项）。
- W3 服务层硬编码中文用户可见文案 → 前端接线时改机器可读 code + i18n key。
- W4 单文件 BGM 超限走「不可读」软降级、总大小超限硬失败，两类提示不一致 → 后续区分提示。
- Info 存量 models 未 trim/空串过滤；预设下架模型后存量残留需人工迁移注释。
- Info `decrypt failed` 模式过宽 → 收窄为 api key 上下文；`.{0,12}` 边界与 `Missing API key` 等常见英文未覆盖 → 后续补 errorCode 通道。
