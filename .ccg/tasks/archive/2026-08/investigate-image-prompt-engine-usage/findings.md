# 调查结论：图片提示词优化引擎是否被调用

## 结论
引擎 **被调用了**。历史记录里的中文/原文提示词不是「没调引擎」，而是 **prompt-engine（8013，LLM=MiniMax-M3）对部分中文输入返回了不可用输出**，且两层校验都放行了它：

1. 引擎侧：仅空输出才回退原文（optimizer.py「LLM returned empty → fallback to original」）；非空的中文聊天式回复原样返回。
2. 流水线侧：`looksLikeRejection()`（story2video-stages.js:1188）只识别显式拒绝语（cannot generate/无法生成/请提供等），拦不住「这段话说得挺有意思…」「抱歉让您感到困扰…」这类聊天式回复 → 直接当作 optimized_prompt 写入历史。

## 证据（本机 %APPDATA%\@multi-publish\desktop）
- 日志 app-2026-08-11.log：每次运行 optimize 阶段（3/7）对 27 个场景全部 `POST /v1/optimize` 200 OK（如 run_1786451463483_7h09 12:31:07-12:31:26，27 次调用）。
- run-state\run_1786423389565_2x2o.json（12:43，最新持久化快照）context.optimize：27 条均有 providerId=prompt-engine、model=MiniMax-M3；其中 seg0=中文点评、seg4/18/19/23=中文旁白原文。
- story2video-projects 最新完成运行（8/11 12:31）27 段中仅 seg8 为中文原文，其余 26 段为英文画面提示词。
- 引擎输入：split 阶段（smart-sentence-splitter）场景无 prompt 字段（仅 text=中文旁白），getScenePromptSeed 回退 scene.text（story2video-stages.js:1081）。

## 为什么「看起来没调引擎」
- 引擎对部分中文输入输出：①中文聊天/点评文本；②带样式后缀的道歉回复（如 ", Chronochromism, Tilley Lamp, Light Blue Foreground."）；③原样回显旁白。
- 这些输出未被识别为无效 → 写入历史 segment.prompt → 用户看到中文原文，误以为未调用引擎。
- 引擎失败/回退时保留的也是旁白原文（skipped_optimize / fallback），同样不像引擎产物。

## 补充核验（2026-08-14）：用户记忆的「中文提示词优化」作用域在视频域，不矛盾

用户指出「这两天刚优化为中文提示词（历史名人中文更准确）」——记忆属实，但作用域是**视频提示词引擎**，与图片域是两套系统：

- 图片域 `prompt_engine/strategies/generic.py:101-105` 至今强制英文（ALWAYS output in ENGLISH），最后改动 8/11 14:19（`33ee046`），8/12–8/13 的中文相关提交均未触碰它。
- 中文输出优化全部落在视频域（prompt-engine 仓库 git log 证据）：
  - 8/12 16:23 `6511df4`：独立视频引擎 `video_prompt_engine`（8020，与图片引擎完全分离）；
  - 8/12 19:02 `e517647`：全面增强含 `output_language=zh` 中文输出；
  - 8/12 20:22 `730dc26`：语言路由——veo 英文优先 / **doubao 中文优先**（契约层 `VIDEO_PLATFORM_LANGUAGE`：minimax/seedance/kling/hailuo/doubao/cogvideo/hunyuan/wan/agnes→zh）；
  - 8/13 12:40 `491b3bf`：文化锚定（英文画面描写保留中文历史身份/服饰事实——「历史名人中文更准确」对应此功能）。
- 中文输出只存在于 **8020 独立引擎**（`video_prompt_engine/strategies/doubao.py` 中文优先；generic_video `output_language=zh` 时中文主体+英文镜头术语）。8013 兼容后端的 video 域策略 `prompt_engine/strategies/video/generic.py` 输出仍是英文；8020 需 `VIDEO_PROMPT_PORT` 启用（prompt-bridge.js:73 `_standaloneTarget`），未配置时回退 8013 全英文。
- 委托链：图片 `serviceBus.optimizePrompt`（service-bus.js:49）→ 8013 `/v1/optimize` 图片域；视频 `optimizeVideoPromptsBatch`（videogen-stages.js:669）→ 8020 优先 → 8013 `domain=video` 回退。
- 时间线无冲突：用户看到的历史 `run_1786451463483_7h09` 是 8/11 12:31–13:03，当时 video 域都未合入（8/11 23:18 `5bfa55a`），8020 更不存在；run-state 27 条 `platform=generic` 正是图片域标记（视频域会归一为 `generic_video`）。8/12–8/13 无新运行，故用户最新历史只能是 8/11 的。
- 结论修正补充：历史里的中文是 **MiniMax-M3 在图片域（强制英文）下的违规输出**，不是 doubao 式中文画面提示词。若图片提示词也要中文文化保真，需单独在图片域加类似文化锚定/语言策略，当前实现不会自动下沉。

## 修复方向（待决策，未实施）
- 引擎侧：图片领域增加「输出必须是英文画面提示词」的语义校验（检测聊天式回复/中文占比/非视觉描述）。
- 流水线侧：优化结果增加语义有效性校验（中文占比过高/含对话特征 → 判无效回退或 fail closed）。
- split 侧：让 split 阶段产出场景 prompt 字段（英文画面描述），避免输入就是旁白原文导致引擎空转/误判。
