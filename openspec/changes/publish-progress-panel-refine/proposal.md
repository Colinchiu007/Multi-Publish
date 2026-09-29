# Proposal: publish-progress-panel-refine

## Why

发布进度浮窗（publish-progress-ux 已交付）在真机使用中暴露「信息散乱、不够精致专业」的观感问题，且存在一处功能可达性缺口：

1. **同一事实多重表达**：成功任务同时呈现「✓成功」文字、步骤链末端「完成」高亮、「100%」、会话角标「已完成」——四重冗余。
2. **6 词文字步骤链是最大噪声源**：每任务挂「准备 上传 填写 提交 校验 完成」整条文字链，N 个任务即 6N 个词，扫读无法快速定位当前步。
3. **信息层级倒挂**：「请勿关闭应用」（唯一操作约束）以最弱样式（xs/muted/脚注）呈现；「发布任务」fallback 占位标题反而加粗当组标题，多会话无法区分。
4. **任务行无网格对齐**：flex-wrap 使步骤链/百分比随平台名与状态文字长度跳动。
5. **取消入口不在浮窗内**：用户盯着浮窗想中止发布时，取消按钮只存在于页面级（Publish.vue），浮窗无入口。
6. **取消链路断在主进程**：TaskQueue 取消任务时发 `task:cancelled`，但无人转发到渲染层——页面级取消后浮窗永远显示「进行中」（既有缺陷）。
7. **失败恢复路径断在「只能看」**：错误文本截断 120 字仅靠 title 悬浮看全文；无单任务重试、无复制错误入口。
8. **完成态不自收敛**：全部完成后浮窗常驻展开，需手动收纳。

## What Changes

- **任务行重构（视觉）**：6 词文字步骤链 → dot-stepper（6 圆点+连线，当前步高亮+脉冲、过去步实心、未来步空心，仅显示当前步一个词）；任务行改固定网格（平台 | 状态 | 步骤/明细/错误 | 百分比右对齐 | 操作）；success 行去掉「100%」；queued 行不预渲染步骤链。
- **去重与层级（视觉）**：汇总行改「成功 {succeeded}/{total} · N 失败」（不再把 failed 计入「已完成」）；单会话时扁平化（去卡中卡嵌套、去会话徽标）；多会话保留分组卡+徽标（点+文字，去色块底）；fallback 会话标题带时间「发布 · HH:MM」。
- **footer 升级（UE）**：底部提示升级为警示条（warning-soft 底+图标+更强字重），与「取消全部任务」入口合并同一行；取消采用两步内联确认（免模态，不触碰浮层互斥合同）。
- **取消链路端到端（UE/功能）**：主进程 phase4-events 转发 `task:cancelled` → `publish:progress` 新相位 `cancelled`（终态）；store 新增 `cancelRunning()`（逐任务 `queue:cancel`，防重入）；任务行呈现「已取消」中性态；aggregate 新增 cancelled 计数。
- **失败恢复闭环（UE）**：失败行内联「重试此任务」（单任务级）与「复制错误信息」图标按钮；会话级「重试失败项（N）」保留。
- **完成自动收敛（UE）**：全部成功（无失败/无取消）且面板展开时，5 秒无操作自动最小化为胶囊；面板内任意 pointerdown 或新会话开始即取消收敛；存在失败/取消时不自动收敛（不遮蔽恢复入口）。
- **micro-interaction（视觉）**：当前步圆点 240ms 脉冲、成功图标 pop-in；全部包裹 `prefers-reduced-motion`。

## Impact

- 代码：`PublishProgressPanel.vue`、`PublishProgressTaskRow.vue`、`src/stores/publishProgress.js`、`electron/services/publish-progress-events.js`（PHASE_ENUM + cancelled）、`electron/bootstrap/phase4-events.js`（task:cancelled 转发）、`locales/zh.js`/`en.js`（成对）。
- 契约：`publish:progress` payload `phase` 枚举新增 `cancelled`（向后兼容加法，PRD §6.1 修订）；面板显示项/状态表/文案表（PRD §8.2/§8.3/§8.4）修订；面板状态机新增自动收敛转移（§8.1）。
- 兼容：不改 TaskQueue 编排语义、不改 `queue:cancel`/`queue:retry` IPC 形状、不接入浮层互斥（非模态负向锁保持）、渲染层不新增第二份阶段映射（stageKey 封闭清单不动）。
- 风险：相位枚举扩展需主进程/渲染层/store 三处同步（漏一处即 cancelled 被归一为 progress）；自动收敛为产品契约变更（PRD 同步修订）。
