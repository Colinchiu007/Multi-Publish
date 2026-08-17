# Review: autonomous-loop-vision-judge

## 审查方式
- Claude reviewer（`/tmp/vision-review-claude.txt`，11KB）已读全文；antigravity 不可用（地域资格拒绝，Eligibility check failed，`/tmp/vision-review-antigravity.txt`）→ 按既有降级通道，主代理直审 + 单模型 Claude。

## Claude 发现（均已修复）
| 级别 | 编号 | 问题 | 修复 |
|------|------|------|------|
| Critical | C1 | workflow `LLM_VISION: ... || ''` 布尔陷阱：显式 false 变空串，脚本把空串当「未设置→默认开」，显式关闭失效 | yml 去掉 `|| ''`；test 字面断言 + `|| ''` 守卫 + 求值语义用例（`.github/workflows/autonomous-loop.yml`、`.github/scripts/autonomous-loop-workflow.test.js`） |
| Critical | C2 | `runOrchestratorLoop` 未把 llmFn 传 `TestOrchestrator` → visualJudge=null → base64 图永不发出 | `new TestOrchestrator({ ..., llmFn, vision })`；Scenario 6 断言 analyzer.visualJudge 非空 |
| Warning | W1 | `_judgeWithLLM` 纯文本路径无 try/catch；need_review/uncertain 被推入 expectedChanges → 绕过 NEED_HUMAN 直达 UPDATE_BASELINE（fail-open） | 文本路径 try/catch → need_review；`analyzeVisual` 新增 needReview 分组；`decide` 优先 NEED_HUMAN |
| Warning | W2 | analyzeVisual 不看 status，PASSED 高 diff 也烧 3 图 vision | 仅 `status==='FAILED'`（或未标注）调用 judge |
| Warning | W3 | 无单图大小上限，同步读盘+dataUrl 双拷贝，超大图打爆 body | `MAX_IMAGE_BYTES=3MB`，encodeImage statSync 超限返回 null |
| Info | — | prompt 固定写 3 张图但可能只发 1-2 张 | 按实际附着图动态生成 attachedLine |
| Info | — | 图片路径未透传 route | `route: ctx.route || diff.route` |

## 自审结论
- Critical 全部修复；Warning 全部修复；Info 已修。
- 测试：包 189/189（+10 回归）、workflow 合同 10/10（+1 语义）。
- 无 auth/DB/IPC/locale 变更；无用户可见文案变更。
