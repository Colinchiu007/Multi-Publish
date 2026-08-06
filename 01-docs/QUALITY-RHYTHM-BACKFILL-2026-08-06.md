# 质量节拍补跑复盘（2026-08-06）

> 应需求「把前面几十轮的对话过一遍，需要补跑质量节拍的就补跑一下」。
> 范围：本会话最近几十轮交付（PR #368 / #369 / #370 / #371 及中间提交）。

## 一、逐批门禁核对

| 批次（提交/PR） | PRD/文档 | 测试 | 审查 | learnings/记忆 | 门禁结论 |
|----------------|----------|------|------|----------------|----------|
| MiniMax TTS 音色目录+克隆；错误多语言（PR #368 起点） | PRD 7.1.4/7.1.5 ✅ | 音色目录/克隆/通知 ✅ | 随批次 ✅ | ✅ | 通过 |
| 中文字幕 CJK 字体（530e7bd） | PRD 中文字幕合同 ✅ | compose-engine 39 项（跨平台化后 CI 过）✅ | ✅ | ✅ | 通过 |
| 提示词优化重试+限流友好（758808f） | PRD 7.1.7 ✅ | 重试/通知/映射 ✅ | ✅ | ✅ | 通过 |
| 挂载恢复运行态（106dfa8） | 含在 7.1.8 ✅ | resume 单测 ✅ | ✅ | ✅ | 通过 |
| API 并发/排队/重试 + 断点恢复（87796b5，PR #368） | PRD 7.1.8 ✅ | governor/resume/阶段续传 41 项 ✅ | ✅ | ✅ | 通过 |
| 进度细化与信息视觉化（a36e4f7，PR #368） | PRD 7.1.9 ✅ | 进度/汇总 149 项 ✅ | ✅ | ✅ | 通过 |
| 选项持久化（1c1eeb1，PR #368） | PRD 7.1.10 ✅ | 保存/恢复/重置 ✅ | ✅ | ✅ | 通过 |
| E2E 全流水线 + 2 修复（PR #369） | E2E 报告 + learnings ✅ | videogen/governor 回归 ✅ | ✅ | ✅ | 通过 |
| UE 优化（PR #370） | PRD 7.1.11 + 方案文档 ✅ | CreateView 72 项 + vite build ✅ | ✅ | ✅ | 通过 |
| E2E 待办清单（PR #371） | 文档 ✅ | — | — | ✅ | 通过 |

**本轮补跑发现的门禁缺口：**
1. **CHANGELOG 未更新**：PR #368/#369/#370/#371 批次均未追加 `CHANGELOG.md`（质量节拍 ⑤ 文档更新要求 CHANGELOG 追加）。→ 已补 6 个 [未发布] 条目。
2. **QM-1 打包验证未跑**：多批修改了 `apps/desktop/electron/` 代码（governor/pipeline-engine/videogen/preload/stages），本会话未执行 `electron-builder --win --dir`。→ 本轮补跑（结果见下）。
3. **Code Review 无独立记录**：此前以随批次内联审查为主，无合并后的集中审查记录。→ 本轮补跑集中审查（见下）。

## 二、QM-1 打包验证（补跑）

- 命令：`cd apps/desktop && node ../../node_modules/electron-builder/cli.js --win --dir --publish never`
- **结果：通过** — exit=0；asar 含新增模块（`api-usage-governor.js` / `run-state-store.js` / `videogen-stages.js` / `pipeline-engine.js` / `story2video-stages.js` / `preload/index.bundle.js`）；打包应用 `Multi-Publish.exe` 启动存活 ≥10s 且出现可见主窗口（标题“社媒管家”），无崩溃。
- 提示：构建日志仅一条 `playwright-browsers` 源缺失告警（extraResources 可选），不影响本次主进程代码验证。

## 三、集中代码审查（补跑，针对已合并批次的核心新代码）

审查对象：`api-usage-governor.js`、`pipeline-engine.resumeOrchestration`、`run-state-store.js`、`videogen-stages.js`（resolve 辅助）、`CreateView.vue`（选项持久化 + UE）、`preload/publish.js`。

### 🔴 CRITICAL
- 无。

### 🟠 WARNING
- **W1（低）run-state 快照未按 owner 隔离**：`RunStateStore` 快照按 runId 落盘（`userData/run-state/<runId>.json`），未加 owner 前缀；同机多账号场景下，泄露 runId 即可读取他人上下文。建议后续改为 `ownerHash/runId` 目录并纳入清理。当前运行 id 为不可枚举随机值，风险可控。
- **W2（低）governor 排队超时回收依赖下次释放**：`_acquireSlot` 中已过截止的 waiter 仅在 `_pump`（下次释放时）被拒绝；若某 key 无后续释放，超时 waiter 会等到任务链结束。有界且影响面小，建议后续在 run 结束时统一回收。
- **W3（信息）governor 默认 RPM 为保守估计**：llm 30 / tts 10 / image 10 为内置默认，真实供应商限额差异大；已具备 429 自适应降预算（0.75）+ 时间槽排队，建议后续按 provider 配置化校准。

### 🟢 INFO
- `resumeOrchestration` 已处理内存/磁盘快照双源、内容政策禁止恢复、阶段状态重建；`runIdentifier` 兼容 `id/runId` 字段。
- 新 IPC `pipeline:resumeOrchestration` 走 `withSenderCheck`；参数纯 JSON。
- 选项持久化：恢复时对已禁用 provider 不回填、类型守卫合并、深拷贝防引用共享；写入不保存文案正文。
- 无新增 `console.log`（统一 logger）；无硬编码密钥。

## 四、补跑动作清单（已执行）
- [x] CHANGELOG 追加 PR #368/#369/#370/#371 批次条目
- [x] QM-1 打包验证（electron-builder --win --dir）
- [x] 集中代码审查并记录结论
- [ ] （待）W1/W2/W3 优化项排入后续迭代

## 五、遗留
- W1（run-state owner 隔离）、W2（governor 排队回收）、W3（RPM 配置化）记为技术债务，后续迭代优先闭环。
- 视频生成模型未配置的 4 条流水线 E2E 重测待办见 `01-docs/E2E-PENDING.md`。
