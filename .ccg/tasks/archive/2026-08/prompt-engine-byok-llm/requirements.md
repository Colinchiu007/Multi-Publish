# 交接备注：MiniMax 换 Key 后 optimize 仍报额度（2026-08-16，来自 fix-minimax-quota-stale-key）

> 外部诊断会话 2026-08-16 核验真实用户数据后追加，供 BYOK 桌面侧实现/验证对照；不是本 change 的需求文件。

## 现象
用户 10:49 在桌面「模型设置」更新 minimax-multimodal 新套餐 Key；流水线 optimize 仍报「模型 API 的额度或余额已用完」（story2video.quota_exceeded）。诊断确认根因是 8013 引擎用自身 config/.env 的 MiniMax Key 兜底，与桌面 model_providers 两套凭据。

## 硬证据时间线（profile: D:\tmp\Multi-Publish-debug-profile）
- 2026-08-16 10:49:19 minimax-multimodal updated_at（新 Key 入库，api_key_enc 存在）
- 10:58 listVoices / 11:47:38 testConnection / 11:50:47 generateImage 全部 success（桌面 manager 侧新 Key 可用）
- 11:43 / 11:46 / 11:48 三次运行全在 stage=optimize (3/7) 失败：
  Error code: 402 - {'type': 'error', 'error': {'type': 'insufficient_balance_error', 'message': '当前已达到 Token Plan 用量上限…'}}
- prompt-engine/.env（MINIMAX_API_KEY，MiniMax-M3）mtime=2026-07-19，与桌面设置无关

## 对本 change 的验证建议
- PromptBridge 注入 llm/caller 后，「设置换 Key → 重启 → 重跑 optimize」应直接生效；可对照上述时间线设计回归：
  1. 注入 key 必须来自 ModelProviderManager 当前解密值（getProviderWithKey），而非启动时快照；
  2. 无可用 LLM 时桌面 fail-closed（不向 8013 发请求）；
  3. 覆盖 legacy-8013 回退分支（optimizeVideo / optimizeVideosBatch），避免部分路径仍无 llm 导致 422。
- 与引擎侧 change 成对发布：引擎先发会让未带 llm 的调用 422；桌面先发字段被忽略、继续用旧 Key。
