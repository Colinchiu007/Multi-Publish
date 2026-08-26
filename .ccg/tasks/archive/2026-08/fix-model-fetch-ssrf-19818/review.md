# 审查报告：fix-model-fetch-ssrf-19818

## 变更
- ops-center/backend/config.py: 新增 OPS_ALLOW_PROXY_BENCHMARK_IPS（默认 False=fail-closed）
- ops-center/backend/services/model_preset_service.py: 仅开关开启时放行 198.18.0.0/15；CGNAT 常量提升；docstring 记录 DNS 重绑定已知边界
- ops-center/backend/tests/test_model_presets_api.py: 3 个回归用例（开关开放行/开关关拒绝/开关开真实私网仍拒绝）

## Claude 审查（52d69da6-3b08-4c20-828a-2b0bb1f24519）
- Warning1 无条件放行缺环境开关 → 已采纳：配置开关默认关闭
- Warning2 IPv6 fec0::/10 site-local 既有缺口 → 记录，超出本次范围，另行立项
- Warning3 DNS 重绑定 TOCTOU 既有缺口 → 已写入 docstring 已知边界
- Info: IPv4-mapped v6 / 注释版本 / 常量提升 → 常量提升已采纳；IPv4-mapped 影响极小记录

## opencode 审查（ses_fc12c1403ffeZaDvcSWmxrQbfM）
- C1 DNS 重绑定 TOCTOU（预存在，开关开启后窗口放大）→ 已记录已知边界
- M2 缺"开关开+真实私网仍拒绝"用例 → 已补 test_fetch_models_flag_on_still_rejects_real_private
- M1 开启时启动告警日志 → 加固项，后续跟进
- 结论：方向正确，默认 fail-closed，可批准合并

## 结论
无未处理 Critical；Warning 已按建议收敛（配置开关 + 边界记录 + 补测）。剩余加固项（告警日志、fec0 支持）另立项。
