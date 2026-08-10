## ADDED Requirements

### Requirement: video 配置段参数治理
story2videoTextConfig.video 段 SHALL 纳入参数治理：mode/fixedRatio/minRatio/maxRatio/maxScenes 由 normalizer 白名单校验（枚举与数值边界如混合流水线能力 spec 定义）；provider/model 为空时运行时解析默认视频生成器。前端提交 MUST 只发送受支持字段，normalizer 对未知字段 SHALL 忽略或拒绝并给出可读错误，禁止静默透传。视频生成并发 SHALL 固定为 1（系统管理，不暴露 UI），与图片/TTS 并发互不影响。

#### Scenario: 非法比例被拒绝
- **WHEN** renderer 提交 `video.fixedRatio = 200` 或 `video.minRatio > video.maxRatio`
- **THEN** normalizer 抛错并返回可读错误，流水线不启动

#### Scenario: 未知字段被忽略
- **WHEN** renderer 提交 video 段包含未声明字段（如 `video.foo = 1`）
- **THEN** normalizer 忽略未知字段，不污染归一化结果

#### Scenario: 视频并发固定为 1
- **WHEN** 混合模式 generate_assets 执行视频生成
- **THEN** 视频生成并发恒为 1（不随 concurrency 参数变化），图片/TTS 并发不受影响
