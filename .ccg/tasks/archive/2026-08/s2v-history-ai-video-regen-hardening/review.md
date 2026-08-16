# Review — s2v-history-ai-video-regen-hardening（W4/W5）

## 审查方式
- 双模型并行 wrapper：antigravity + Claude（reviewer.md）。
- antigravity：`Error: Eligibility check failed ... not currently available in your location` —— 地区不可用，**降级记录**（与既往会话一致）。
- Claude：首轮 `claude exited with status 1`（wrapper 层失败），重试成功，产出完整分级报告（SESSION_ID 61720a82-4dea-4149-8e55-2ba04af29f3b）。

## Claude 结论
- **Critical：0**
- **Major（3，全部已处置）**：
  - **M1** `generateSceneAiVideo` 把整轮 提交→轮询→下载 当可重试单元，轮询超时（`视频生成超时或失败` 命中 TRANSIENT_PATTERN 的 `超时`）会被整体重试 → 最多 3 次计费 + 约 30 分钟 `_serializeProject` 队列持锁。
    - 处置：`withAssetTransientRetry` 新增可选 `excludeMessages`；service 默认 assetRetry 排除 `视频生成超时或失败/视频生成任务失败/视频生成任务状态为`（任务已提交后的轮询超时/终态不重试）；提交/下载阶段瞬时错误仍重试；流水线默认参数行为不变。回归：定向用例 + 全量套件。
  - **M2** 抛错路径重试耗尽返回 `{code:-1,message}`，守卫只读 `outcome.error` → 真实瞬时错误文案退化为兜底「AI 视频生成失败」。
    - 处置：守卫改为 `(outcome && (outcome.error || outcome.message)) || 'AI 视频生成失败'`；新增回归「真实 `withAssetTransientRetry(maxAttempts:1)` 耗尽 → 抛出与回写错误均为 `request timed out`」。
  - **M3** `delete-project` 绕过队列，PRD「全部写路径串行化」断言失真，且存在「队列内任务先 getProject 读旧项目 → delete 执行 → `_upsertProject` 复活已删项目」竞态。
    - 处置：`delete-project` 纳入 `_serializeProject`；IPC 队列计数断言 6→12；PRD/CHANGELOG/openspec 措辞改为「全部写路径（含删除）」。
- **Minor（3）**：m4 ECONNREFUSED 与通知分类器分类相反 —— 复用流水线同源语义，接受并记录（不改变共享函数行为）；m5 测试缺口 —— 已补 2 条（重试耗尽 fail-closed、非瞬时结果对象不重试）；m6 select-scene-material 服务级校验在队列内 —— 知悉，`previous.catch(()=>{})` 不阻塞后续任务，无行为影响。
- **Info（3）**：i7 嵌套重试风险（生产默认 stage 无内部重试，测试注入隔离）；i8 混合错误预算不连续（有界可接受）；i9 replace-audio 临时副本清理延后到队列结算（受控目录，无安全影响）——均记录知悉，不引入代码变更。

## 复审结论
- Claude：**有条件通过（Approve with changes）**；3 项 Major + m5 已按建议处置并补回归，定向 85 passed、全量 vitest 通过、QM-1 打包 + 8s 冒烟通过。
