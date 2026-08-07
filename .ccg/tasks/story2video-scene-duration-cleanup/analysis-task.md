任务：审查两个已确认的 Story2Video 场景时长改动（工作树 D:\Data\projects\Multi-Publish，分支 codex/smart-sentence-splitter）。只做分析，不修改代码。

【改动 A — 动效按有效时长归一化（apps/desktop/electron/services/story2video-compose-engine.js）】
- buildImageEffectFilter(effect,width,height,fps) 增加可选第 5 参 duration；duration 已知时把 zoompan 动效进度归一化到场景有效时长（T=round(duration*fps)，表达式 min(1,on/T)），duration 未知时保持现有固定帧增量公式（向后兼容）。
- 归一化公式：zoom-in: 1+0.25*min(1,on/T)（原 min(zoom+0.0015,1.25)）；zoom-out: if(eq(on,1),1.25,1.25-0.25*min(1,on/T))（原 if(eq(on,1),1.25,max(zoom-0.0015,1))）；pan-left/right/up/down 位移端用 min(1,on/T) 或 (1-min(1,on/T))（原 on/120 系）；zoom-pan: 1+0.15*min(1,on/T) + 平移端 min(1,on/T)（原 min(zoom+0.001,1.15) 与 on/180）；rotate/blur-in 不变。
- _createSegment 新增 effectDuration 选项；compose() 每场景有效时长 = audioDuration || reportedDuration || defaultSceneDuration（音频探测失败时用 defaultSceneDuration 兜底，用户已确认）；renderSegment 同理。T 用字面量帧数写进表达式。

【改动 B — 彻底去除“无旁白纯图片轮播”模式相关内容（perImageDuration 用户可配置面）】
- apps/desktop/src/views/CreateView.vue：删「单画面时长（秒）」输入、s2vConfig.perImageDuration 默认值、story2videoTextConfig 构建里的 perImageDuration、applyS2VTemplate/saveS2VTemplate 的 perImageDuration。
- apps/desktop/electron/services/story2video-text-config.js：删 perImageDuration 归一化与输出；defaultSceneDuration 保留为固定默认 6（兼容 params.defaultSceneDuration 旧别名），作 compose 回退/归一化兜底。
- packages/python-backend/src/multi_publish/video_creation/pipeline/definitions/story2video-compose.yaml：runtime_defaults 删 perImageDuration。
- packages/story2video-engine/src/types.ts + template-library.ts：VideoTemplate 删 perImageDuration 字段与 BUILT_IN_TEMPLATES 值、isTemplateValid 校验。
- 01-docs/PRD-video-creation.md 与 01-docs/learnings.md 同步。
- 测试同步：CreateView.test.js、story2video-text-config.test.js、story2video-compose-engine.test.js、story2video-engine 相关测试。
- 明确不删：split 阶段 images 输入分支（stage-executor.js:201-208，图片+配音模式，不是无旁白）、story2video-compose.yaml 的 unsupported_modes.gallery 合同、CreateView quick-render gallery（remotion，独立功能）。

请审查并输出：
1. 改动 A 归一化公式正确性；zoompan 的 on 起始语义（on 从 1 起）、除零/极短场景/非 30fps 边界；
2. 改动 B 删除清单是否完整且不过度：还有哪些“无旁白/纯图片轮播”残留该清理，哪些不该删；
3. 配置合同与持久化兼容：旧项目历史配置带 perImageDuration 在恢复/归一化时是否崩溃；defaultSceneDuration 固定 6 是否合理；
4. 测试缺口：需要新增/修改哪些断言（列出具体用例）；
5. 风险与遗漏。

输出：按 Critical / Warning / Info 分级，每条注明文件与建议。
