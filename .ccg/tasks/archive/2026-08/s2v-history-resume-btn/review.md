# review.md — s2v-history-resume-btn

## 结论：非 Bug，属设计行为（内容政策失败不可断点恢复）

## 用户问题
视频创作-历史记录中，最新一个执行失败的任务没有「从断点继续」按钮；老的失败任务有。

## 数据证据（真实用户数据）
- 最新失败任务：run_1786807690498_ee06（2026-08-15 16:16 结束，stage 4 generate_assets failed）
  - error 含 7 张图片失败：Image #49/#73-#77 "Image generation requires user input after content-policy review"
  - 另有 2 张瞬时失败：#5/#15 "This operation was aborted"
- 老失败任务（均有按钮）：
  - run_1786782878239_4nhd ffmpeg narration concat 失败
  - run_1786724864138_fvt2 成片总时长超过 10 分钟
  - run_1786539811506_hejy serviceBus is not defined
  - run_1786515108809_w4y8 storyboard 无法解析场景 JSON
  - run_1786496480762_xmd4 提示词优化数量与场景不一致
  - 以上 error 均不命中内容政策关键词 → 按钮显示

## 机制链
1. story2video-stages.js:793「内容政策 needs_user_input 优先整体失败」——任一场图片命中
   内容政策（重试+内容安全改写后仍拒绝）→ 整个 generate_assets 阶段失败，
   error 聚合所有失败图（含 "content-policy review" 字样）。
2. 前端历史列表 historyItemResumable（CreateViewHistory.vue:357 /
   usePipelineHistory.js:209）：status 为 failed/paused 且 error 不命中
   /needs_user_input|content[_-\s]?policy|可能需要修改文案/ 才显示按钮。
   ee06 的 error 含 "content-policy" → 命中 → 按钮隐藏。
3. 主进程 resumeOrchestration（pipeline-engine.js:1330）同样拦截，返回
   PIPELINE_USER_INPUT_REQUIRED「该失败需要人工处理（内容政策），请修改文案后重新启动」。
4. 设计意图：pipeline-engine.js:1290 注释 + 契约测试
   pipeline-story2video-contract.test.js「内容政策 needs_user_input 检查点不能被继续操作绕过」。
   引入 commit：87796b5f（断点恢复功能本身）。

## 附带发现（不一致，建议后续评估）
- CreateView.vue:1875 错误对话框正则用 content\s*policy（只匹配空格），
  历史列表/主进程用 content[_-\s]?policy（匹配空格/下划线/连字符）。
  ee06 类错误（"content-policy" 连字符）在实时失败对话框会显示「从断点继续」，
  点击后后端以 PIPELINE_USER_INPUT_REQUIRED 拒绝 → 按钮闪现后消失，体验不一致。
- 混合失败（瞬时 2 图 + 政策 7 图）时整体禁用恢复，恢复重跑 generate_assets 会
  在政策场景再次失败；但用户无法从历史页获得「哪些场景需修改」的指引。
