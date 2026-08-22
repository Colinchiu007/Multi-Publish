# 质量节拍审查报告：fix-s2v-prompt-translation-wrappers

## 结论

PASS：无 Critical、无未解决 Warning，可交付。功能变更已由 PR #1117 合并；本文件保留双模型审查、QM-5 分析和验证证据。

## 根因与修复核对

- f7899b20b5 首次引入 translatePromptsForLocale 时直接对 LLM content 执行 JSON.parse(raw)，默认响应必须是裸 JSON。
- 16b2db8427 只处理 Markdown fence；HTML response/thinking、marker、前后说明和其它 provider 包装仍会让 JSON 解析失败。
- 解析失败后旧逐行回退把包装文本当成译文，污染结果页 segment.promptTranslation 的“中文翻译”。
- 最终修复增加 extractParseableJsonObject 与 extractBalancedJsonAt：扫描所有 { 起点，正确处理嵌套对象、字符串内花括号和转义；跳过未闭合/不可解析候选，取最后一个可解析对象；无合法对象时保留现有 fail-open 逐行回退。

## QM-5 逃逸分析

1. 单元测试：原有 fixture 以裸 JSON/Markdown 为主，没有真实 HTML、thinking、marker 包装，也没有字符串转义、嵌套对象、前导花括号和示例回显场景。
2. 集成测试：翻译链路没有用真实 provider 响应形态验证 raw -> parser -> segment.promptTranslation 的最终字段，协议包装因此未被拦截。
3. E2E/视觉：页面层只验证翻译区域可显示，没有断言用户可见文本不包含 HTML/marker/JSON 协议噪声。
4. 代码审查：首轮审查识别了“首个花括号独占”会误取示例对象或被未闭合前导花括号阻断；功能分支补充多候选扫描和 3 条边界回归后，Claude 与 opencode 最终均通过。

## 双模型审查

### opencode

- 结论：通过，可合并，无 Critical/Major。
- 已确认：字符扫描正确处理字符串内花括号与转义；JSON 解析失败仍保持 fail-open；HTML、thinking、marker 主路径回归通过。
- 首轮 minor 建议（注释措辞、多候选花括号）已在最终提交中处理。

### Claude

- 最终结论：Approve，无阻塞项。
- 首轮 W1：首个 { 可能被说明文字或 LLM 示例占用。已改为遍历每个候选起点、跳过不可解析片段并取最后一个可解析对象。
- 首轮 W2：字符串转义、嵌套对象、未闭合前导花括号和示例回显缺少回归。已补 6 条测试覆盖。

## 验证证据

- apps/desktop/electron/services/story2video-stages.test.js：137 passed / 137。
- 提示词翻译定向用例：13 passed。
- node --check：通过。
- 变更逻辑无新增 ESLint 错误；4 个错误位于未修改存量行 2064/2071/3366/3368。
- PR #1117 远端必需检查全部通过：QG Gate Result、Static、Autonomous、Browser E2E、Coverage、Desktop Shards 1/2、Unit、Visual、Ubuntu/Windows build、electron-tests、gui-test、visual-test、单元测试 + Lint、文档同步、Stale Issue；release 预期 skipped。
- PR #1117 已于 2026-08-22T17:45:31Z squash 合并，merge SHA 1e47e20121d6a34cb9fe012c56a9fd39924476f0；origin/main 已核对包含该 SHA，功能分支已删除。

## 预防措施

- 结构化 LLM 消费点必须用真实 provider 包装形态建立 fixture，不能把“只输出 JSON”的 system prompt 当作解析保证。
- 解析候选、结构校验、用户字段脱噪要分别断言；逐行/原文回退必须证明不会写入协议包装。
- Windows wrapper 报 claude 找不到时，先定位交互式终端可用 CLI 并修正子进程 PATH/Git Bash 环境，再判断外部审查后端是否可用。
