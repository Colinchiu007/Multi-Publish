# Review — voice-catalog-error-clarity

## 根因（2026-08-09，含运行时证据）
- 图片轮播流水线 TTS provider 无可用 API Key（debug profile：minimax-tts enabled=0 无 key；minimax-multimodal key safeStorage/DPAPI 解密失败）
- callAdapter 返回「尚未配置 API Key」→ tts-voice-service.getCatalog 折叠为 VOICE_CATALOG_UNAVAILABLE → CreateView「暂时无法获取音色列表，已使用默认音色，请稍后重试。」（永久配置错误被描述为暂时）
- 证据：logs/app-2026-08-09.log「AssetGenerator TTS provider minimax-tts failed: 尚未配置 API Key」+「ModelProviderCrypto Decrypt failed」；DB 行状态如上

## 修复
- service：新增 VOICE_CATALOG_CONFIG_UNAVAILABLE（配置/认证类关键词）+ VOICE_CATALOG_UNSUPPORTED（方法不支持），网络/超时/未知保底 UNAVAILABLE；detail 脱敏透传（先脱敏后截断 ≤200，Bearer/token/api key/secret/sk- → upstream-auth-error）；目录失败路径 + IPC catch 补日志
- 前端：CONFIG 映射「当前语音服务商配置不可用，请在模型设置中检查并配置后重试。」；仅瞬时/未知错误显示「刷新音色列表」（refresh:true）；select/clear 失败路径友好映射；记录错误码用于刷新按钮作用域
- 回归：service +9、CreateView +2、IPC 日志；149 用例通过

## 自查（质量节拍六项）
- 异常处理：callAdapter 抛错路径分类+日志（不再吞）
- 权限边界：无新 API；IPC 通道不变，仅新增 message 码（向后兼容，Claude 评审 I2 已验证无 === 比较）
- 事务一致性：失败不写缓存/偏好（既有语义保持）
- 边界值：undefined message → 瞬时兜底；detail 截断 ≤200；脱敏先于截断
- 代码风格：与既有 failure()/log 模式一致
- 硬编码：无密钥；detail 脱敏；日志不记录密钥

## 双模型评审落实（Claude 完整评审 77 行；antigravity 后端不可用（agy not found）→ 按降级规则主代理执行）
- C1 已修：select/clear 失败路径经 friendlyVoiceCatalogError + 测试断言改友好文案
- W1 已修：/未找到.*适配器/ 正则覆盖插值 providerId
- W2 已修：401/unauthorized/invalid api key/认证失败/key 无效 加入配置类；not-supported 拆到 VOICE_CATALOG_UNSUPPORTED
- W3 已修：callAdapter throw 路径同样分类 + 日志
- W4 已修：脱敏先于截断 + sk- 覆盖（注释与 logger SECRET_PATTERNS 同步）
- W5 已确认：既有 'Bearer token leaked by upstream' 断言无需迁移，实测通过
- W6 已修：刷新按钮仅瞬时/未知错误显示（s2vVoiceCatalogErrorCode + s2vVoiceCatalogRefreshable），CONFIG 不显示
- W7 已修：CONFIG 文案泛化为「在模型设置中检查并配置后重试」
- I5 已修：导出 classifyCatalogFailure/redactFailureDetail + undefined message 兜底测试
- I4/I6 后续优化（不在本 PR）：共享 redactor 模块、与 story2video-notifications MODEL_CONFIGURATION_PATTERN 统一

## 验证
- 定向 Vitest：service 27 + CreateView 118 + IPC 4 = 149 通过
- Vue build + electron-builder --win（QM-1）：exit 0；ASAR 含 tts-voice-service.js；渲染产物含新错误码/刷新按钮/文案；require 链 OK；10s 启动主窗口显示、stderr 无 QM-1 失败模式
- node_modules/@multi-publish/* junction 已指向当前 worktree（打包证据合规）
