# REVIEW — story2video-scene-duration-cleanup

## 改动摘要
1. 动效归一化（方案一）：buildImageEffectFilter 增加可选 duration；duration 已知时 zoompan 进度按 `min(1,on/round(duration*fps))` 归一化，未知时保持固定帧增量向后兼容。compose()/renderSegment 计算 `effectDuration = audioDuration || reportedDuration || defaultSceneDuration`（音频探测失败回退默认 6s，用户确认）。
2. 去除无旁白纯图片轮播模式（方案二取消 + 彻底移除）：删除 CreateView「单画面时长/无旁白场景时长」选项、Story2VideoTextConfig.perImageDuration、YAML runtime_defaults.perImageDuration、VideoTemplate.perImageDuration（types + BUILT_IN_TEMPLATES + isVideoTemplate）；defaultSceneDuration 保留为内部固定默认 6（compose 回退/归一化兜底，兼容 params.defaultSceneDuration 别名）；旧项目历史配置的 perImageDuration 兼容忽略。

## 分析（codex analyzer，2026-08-07）
- 归一化公式经实证正确（on 按输出 fps 推进、T=round(duration*fps)、除零有 Math.max(2) 守卫、24fps/极值正确）。
- 删除清单完整；保留项（split images 输入分支、unsupported_modes.gallery、quick-render gallery）正确。
- C1（字面 \n 语法损坏）已修复并补回归；C2（代码+测试+文档一次合入）遵守。
- W1（探测失败时 effectDuration=6 与 -shortest 实际时长可能不一致）→ 记录为已知边界，已加断言。
- W2（product-manual 图片轮播口径）= remotion quick-render，保留，无需改。
- W3（旧项目 perImageDuration≠6 恢复后回退固定 6s）→ CHANGELOG 明示。
- W4（按路径精确 stage）遵守。

## 双模型审查说明
- codex reviewer 完成核验：perImageDuration 生产代码清零、project-service 白名单/pipeline-engine compose 默认/yaml runtime_options 的 defaultSceneDuration 保留点均确认，无新增 Critical。
- claude backend 本机损坏（codeagent-wrapper：claude exited with status 1，重复出现），antigravity 的 agy 未安装 —— 本次实际为单模型（codex）审查，未声明为完整双模型交叉验证。

## 验证证据
- desktop vitest 全量：5924 passed / 341 suites（唯一失败为存量未跟踪空测试 tts-voice-clone-service.test.js，与本改动无关）。
- 定向：story2video-text-config 27、compose-engine 37、CreateView 55、pipeline-story2video-contract 13、stage-executor、project-service 20 全过。
- story2video-engine：tsc --noEmit 通过，vitest 53 passed。
- Vue build：`npm run build:vue` 成功（CreateView 模板编译通过）。
- QM-1：electron-builder --win --x64 打包成功（dist-electron\Multi-Publish.Setup.2.3.53.exe）。
- Python test_pipeline_loader 在 cp936 环境因 UTF-8 中文 yaml 存量失败（HEAD 同样失败），与本次改动无关。

## 已知边界
- compose 音频探测失败且无上报时长时，动效归一化用 defaultSceneDuration(6)，但 -shortest 实际片段可能 ≠6s（非回归，learnings 已记录）。
- 旧自定义模板 localStorage 中残留 perImageDuration 字段无害（isVideoTemplate 不做键剥离，无读取方）。
