# 审查报告：TTS 词级时间戳采集（tts-word-timestamps）

## 审查方式（降级记录）

- **antigravity**：codeagent-wrapper 立即失败（exit 1 无输出）——与既有降级记录一致（Eligibility 区域不可用）。
- **Claude**：codeagent-wrapper 立即失败（exit 1 无输出）——外部审查不可用，按 AGENTS.md「子代理降级」规则降级为主代理自检。
- 主代理完成 6 项专项自检（异常处理 / 权限边界 / 事务一致性 / 边界值 / 代码风格 / 硬编码）逐项核对实现 diff（991 行，7 文件 + 已提交接线 f57b5a49）。

## 自检发现（3 项，全部已修复并补回归测试）

| 级别 | 位置 | 问题 | 修复 |
|------|------|------|------|
| 🟠 Warning | minimax-tts.js `_synthesizeAsync` | 异步创建接口字幕参数被拒的降级重试只覆盖非 2xx HTTP 抛错；MiniMax 常见业务错误形态为 **HTTP 200 + base_resp.status_code:2013**（无 task_id），此时不触发重试，TTS 整体失败 | 增加 200-body 业务错误判定（status_code===2013 或 status_msg 命中 invalid/param 正则）→ 同样去字幕参数重试一次；非参数类错误（网络/超时/鉴权）保持原样抛出，错误分类不变 |
| 🟠 Warning | subtitle-align-service.js `alignScenes` Tier1 | Tier1（TTS timings 聚合）循环无 try-catch，与文件声明的 fail-open 契约不符（Tier2 有 catch，Tier1 没有）；未来聚合器改动若抛错会击穿整个阶段 | Tier1 循环体包 try-catch，异常仅 warn 并落入 Tier2 ASR 兜底 |
| 🟢 Info | asset-generator.js `_fetchSubtitleTimings` | 8MB 大小上限在 `response.text()` 读完后才检查，超大文件仍会整体下载 | 读取前先查 `content-length` 头，超限直接放弃（不读正文） |

## 6 项专项自检结论

1. **异常处理**：Tier2/fetch/edge-tts 失败均 fail-open（warn + 回退 ASR/估算），不中断流水线；非参数类 ProviderError 原样抛出不吞错 ✅
2. **权限边界**：本次无新 API/鉴权路径；subtitle 下载走服务商返回的 HTTPS 链接，无鉴权绕过 ✅
3. **事务一致性**：edge-tts sidecar 为独立文件，缺失/损坏时回退旧时长估算；无多步写入依赖 ✅
4. **边界值**：空 timings/空字幕块/coverage<0.5/10s 超时/8MB 上限/100ns 单位换算（÷1e7 实测验证）均有处理；duration 兜底 1.0s ✅
5. **代码风格**：与既有 adapter/服务风格一致（可选链、fail-open 注释、ProviderError 分类）✅
6. **硬编码/Demo 代码**：无硬编码密钥；日志走既有 logger（log.warn/info），无 console.log 新增 ✅

## 回归测试（Fresh 证据）

- minimax-tts.test.js：+2（200-body 2013 降级重试、503 非参数错误原样抛出）→ 52 全绿
- asset-generator.test.js：+1（content-length 超限不读正文）→ 13 全绿
- subtitle-align-service.test.js：8 全绿（含 Tier1 跳过 ASR / coverage 不足回退 / 混合场景）
- 关联套件：story2video-stages 84 + aggregator 4 + provider 25 + manual-assets 21 全绿
- services 全量：**189 文件 / 3412 测试通过**（修复前基线）；修复后受影响 7 套件 207/207 全绿

## 遗留说明

- MiniMax 异步 T2A 字幕字段未在官方 schema 文档化：服务端真支持时查询响应/文件检索返回的 subtitle_file 才可消费；线上有真实 API key 时应做一次端到端验证。
