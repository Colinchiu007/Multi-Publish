# CI 结果修复需求

## 背景

Story2Video 4-slot 场景素材扩展及后续页面更新合并后，主线 CI 出现一组确定性测试失败：\`ResultView.test.js\` 仍按旧的 3-slot/独立 AI 视频按钮/旧媒体字段断言，\`/create\` route functional suite 仍按 15 张流水线卡片断言，而实际页面已经渲染 16 张。视觉门禁的 \`create-editor\` 和 \`create-pipeline\` 基线也需要在确认截图语义后同步。

## 范围

- 将 ResultView 测试同步到当前四个素材槽位：图 1、图 2、视频 1、视频 2。
- 使用当前 radio/change 选择交互和当前素材操作按钮 testid。
- 为视频 URL 重建测试提供当前 \`videoMeta.sceneVideoPath\` 数据合同，并修正保存场景 fixture 的视频字段。
- 将 \`/create\` route functional suite 的内置流水线卡片断言同步为当前实际数量 16，并保留运行时组件、启动 IPC、历史/快速渲染等行为检查。
- 仅在真实像素差异确认来自已合并的页面结构变化时更新两张视觉基线，不放宽像素阈值、不删除测试。
- 保持 autonomous loop 在真实失败时返回失败；不修改其失败降级合同。

## 非范围

- 不修改 Story2Video 当前模型恢复生产逻辑。
- 不修改 coverage 阈值、CI 失败判定或 GUI 失败降级。
- 不盲目合并 PR #1007 的 preload 或无关测试变更。

## 验收标准

1. \`ResultView.test.js\` 全部通过，覆盖四槽位数量、选中态、radio/change 事件、四个素材操作按钮、视频元数据 URL 重建、当前 AI 视频按钮 testid 和保存媒体字段。
2. route functional suite 的 \`/create\` 检查在当前 fixture 下通过，卡片数量与实际内置流水线目录一致。
3. 两项视觉基线通过像素门禁，差异图经人工/静态核对，且不改阈值。
4. autonomous loop 合同测试继续保证有 LLM 配置且真实失败时非零退出。
5. 相关文档、质量记录和记忆记录事实准确，主目录保持 \`main\` clean，代码仅在本 worktree 分支修改。
