# Review — s2v-configured-provider-filter

## 根因（2026-08-09 排查）
debug profile 残留 minimax-image/minimax-tts（key 跨机器复制 os_crypt 解密失败 → is_configured=false），
流水线旧配置显式选中它们 → generate_assets 每 2-3s 一轮「尚未配置 API Key」重试卡住并失败。

## 修复
CreateView.loadS2VProviders.enabledProviders 过滤追加 is_configured === true；
旧配置恢复逻辑（s2vVoiceProviders/imageProviders Set 校验）自动回退已配置项。

## 自查（质量节拍六项）
- 异常处理：无新增异步/异常面。
- 权限边界：无。
- 事务一致性：无。
- 边界值：未配置/已禁用/缺失 is_configured 字段（undefined !== true → 过滤）覆盖；免 Key 本地模型 is_configured=true 保留。
- 风格：与既有 filter 一致。
- 硬编码：无。

## 测试
CreateView.test.js 117 passed（更新 2 用例 + 新增未配置 provider 不出现断言）。
e2e fixture 无图片/语音下拉断言，无影响。
