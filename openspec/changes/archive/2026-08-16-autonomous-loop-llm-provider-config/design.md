## Design

### 背景链路（证据）

- 脚本层能力：`run-autonomous-e2e.js:360-376` `makeLlmFn` 读 `OPENAI_API_KEY || ANTHROPIC_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL`；`run-agent-judge.js:52-53` 读 `LLM_PROVIDER`/`LLM_MODEL`，`:217-228` openai 路径、`:256-267` anthropic 路径。
- workflow 缺口：`autonomous-loop.yml` env 写死 `LLM_PROVIDER: openai`，无 `LLM_BASE_URL`/`LLM_MODEL` 注入 → 三方端点不可用；`Report final status` 降级判定只看 `OPENAI_API_KEY` → anthropic 用户误降级。

### 方案选型

| 方案 | 说明 | 结论 |
|------|------|------|
| A. 仅配置 secrets | 缺 base URL/模型名，脚本仍打官方端点 | 否决 |
| B. inputs + secrets 双通道接线（本方案） | dispatch 时用 inputs 临时覆盖，push/自动触发用 secrets 兜底；默认值保持官方行为；零脚本改动 | 采纳 |
| C. 改脚本自动发现 provider | 改动运行时代码且无必要（脚本已支持 env） | 否决 |

### env 表达式语义

- `LLM_PROVIDER: ${{ inputs.llm_provider || secrets.LLM_PROVIDER || 'openai' }}`：非 dispatch 事件 `inputs` 求值为空 → fallback secrets（非 PR 事件可用）→ 默认 openai。
- `LLM_BASE_URL` / `LLM_MODEL` 同理；空串传给脚本时 `process.env.LLM_MODEL || default` 回落官方默认。
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`：`github.event_name != 'pull_request' && secrets.X || ''` —— PR（labeled）事件按 GitHub 安全限制不暴露 secrets，保持只读降级。

### 降级判定（收紧）

`LOOP_EXIT==1` 且 `OPENAI_API_KEY` 为空 **且** `ANTHROPIC_API_KEY` 为空 且最新报告 `finalStatus == "NEED_HUMAN"` → warning + exit 0；否则 error + exit 1。原「配置了任意 LLM key 仍 NEED_HUMAN 属真实人工判断」语义不变。

### 测试策略

- `node --test .github/scripts/autonomous-loop-workflow.test.js`：9 用例全绿（新增：inputs/env 契约断言、ANTHROPIC key 时 NEED_HUMAN 不降级）。
- 既有 7 用例回归（退出码矩阵、无 key 降级、有 key 失败、报告缺失/损坏、quality-gate 合同）。
- `openspec validate` 校验规格一致性。
