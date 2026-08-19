# 质量节拍审查报告

- Phase: Review / Ship
- Task: `error-message-fix`
- Branch: `codex/error-message-fix`
- Worktree: `D:/Data/projects/mp-worktrees/mp-error-message-fix`
- Date: 2026-08-19

## 外部审查

- antigravity reviewer：未取得报告。wrapper 返回 eligibility failure，当前账号在本地区不可用。
- Claude reviewer：未取得报告。wrapper 启动后无 agent message，最终以 exit 1 结束。
- 按质量节拍降级规则，未将外部模型失败冒充为通过；以下为主代理逐项审查和本地验证结果。

## 本地审查结论

- Critical: 0
- Warning/Major: 0
- Info: 2
  - `ResultView.test.js` 仍有 7 个既有失败，均为素材槽位、AI 视频按钮、媒体 URL 等历史基线断言，与本次失败提示逻辑无关；本次仅更新了受影响的文案断言。
  - CJK 基线从 1485 条重锚到同一批 1485 条存量命中，仅更新 `CreateView.vue` 行号，没有新增渲染端中文硬编码。

## 审查重点

1. `sceneText` 不再作为 renderer 插值参数；场景号、素材比例和图片/旁白类型统一组成自然语言 `context`。
2. provider 显示名集中维护，已知 provider 映射到具体模型名；`account`、`provider`、`unknown`、数字 ID 和未知 provider 不进入用户文案。
3. 缺失 provider 的限流、额度、空结果、API Key、参数不支持、场景重生成和通用 API 失败均回退到本地化“当前模型账号”。
4. 原始错误只用于分类和有限字段提取；HTTP 状态码、端口、服务前缀、请求 ID、堆栈、voice ID 和 raw detail 不直接渲染。
5. zh/en locale 成对更新，formatter 与 renderer 两条入口均有回归覆盖，二次格式化不会重新读取 raw error。
6. 旧历史快照仍可打开；`CreateView.vue` 仅对历史加载失败保留 detail 展示，其他失败不回显调用方 detail。

## 验证证据

- `pnpm exec vitest run src/story2video/notifications.test.js src/story2video/story2video-notifications.test.js src/utils/pipeline-error-formatter.test.js src/views/CreateView.test.js`：276 passed。
- `pnpm exec eslint`（变更相关 JS/Vue/测试文件）：exit 0。
- `pnpm run build:vue`：exit 0。
- `node scripts/verify-worktree-deps.js`：9 项消费方解析当前 worktree，PASS。
- `openspec validate s2v-history-error-message-hardening --strict`：valid。
- `node .github/scripts/check-locale-sync.js --pair-base HEAD`：PASS。
- `node .github/scripts/check-locale-sync.js --cjk`：PASS，基线 1485，当前 1485。
- `git diff --check`：PASS。

## 交付结论

本地质量门禁通过，无未解决 Critical/Major。等待提交、GitHub PR 必需检查和合并后再归档 OpenSpec change 与 CCG task。
