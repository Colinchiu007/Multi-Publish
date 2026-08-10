# 审查结果（review.md）

## 外部双模型审查（Claude，两轮均成功）
- antigravity/gemini 后端不可用（agy/gemini CLI 缺失）；Claude 两轮审查均完成：
  - 第一轮：聚焦 diff（887 行），发现 C1（5h 窗口 key 不匹配）/C2（迁移接线，实为误报——review diff 未含 main.py）/W1-W5/I1-I5。
  - 第二轮（修复后复审）：聚焦 511 行，确认 provider 级共享窗口方向正确，指出接线可见性（phase1-context.js 不在 diff 中，实际已接线）+ 预检时机 + 清空残留 + _pump 并发放行。

## Claude 发现与处置（合并两轮）
| 编号 | 级别 | 发现 | 处置 |
|------|------|------|------|
| C1 | 🔴 | 5h 请求窗口 key 不匹配（provider:type:model vs 裸 providerId） | **已修复**：governor `setProviderTokenWindows` + 跨 key 共享计数（_providerTokenUsage）+ 变更时失效快照；manager 用 provider 级注入；接线 phase1-context.js:174-177（`modelProviderManager.setGovernor`） |
| C2 | 🔴 | 迁移函数无调用点 | 误报：main.py lifespan 已串行调用 ensure_model_preset_columns → ensure_catalog_seeded（幂等） |
| C1b | 🔴 | setGovernor 未接线（复审 diff 不含 phase1-context.js） | 已核实接线存在（phase1-context.js:174-177）；review 覆盖范围注明 |
| M1 | 🟡 | 5h 窗口先消耗后拒绝（超限请求仍真实调用 API） | **已修复**：governor.run 执行前新增只读 `_preflightTokenBudget`（窗口已满立即拒绝，不消耗调用） |
| M2 | 🟡 | 自定义 provider 清空 rpm 后陈旧预算残留 | **已修复**：无静态表时清空 → `removeProviderLimits`；静态表内 → 回填静态预算 |
| M3 | 🟡 | `_pump` 忽略 provider 级 maxConcurrent（排队按默认 2 放行） | **已修复**：`_pump` 用 `st.providerId` 解析 provider 预算 |
| W1 | 🟡 | fetch-models DNS 重绑定 TOCTOU | 文档化残余风险（PRD 12A.3）；管理端工具 + 禁重定向/限时/限大小 |
| W2 | 🟡 | 清空限流配置后陈旧预算残留 | 同 M2 已修复 |
| W3 | 🟡 | default_model∈models 严格 400 与 fetch 清空语义 | 设计决策：严格校验（按需求「根据类型做好数据校验」），PRD 明确 |
| W4 | 🟡 | story2video 未接入 RPM/429/5h | **已修复**：generate_assets 每项经 withModelBudget → governor.run；测试断言路由 |
| W5 | 🟡 | rate_per_minute=0 被静默当未配置 | **已修复**：后端 ≥1（0→400）、前端 min=1、桌面归一化拒绝 0/布尔 |
| I1 | 🟢 | URL 校验过松 | 修复：urlparse 校验主机名 + 拒绝 userinfo |
| I2 | 🟢 | bool → 1 | 修复：归一化拒绝布尔 |
| I3 | 🟢 | fetch 并发删除 → 500 | 修复：判空 404 |
| I4 | 🟢 | mapWithModelBudget 无调用点 | 保留公共工具（withModelBudget 已落地 story2video），测试覆盖 |
| I5 | 🟢 | CGNAT/IP 混淆 | 修复：显式 100.64.0.0/10 |
| I6 | 🟢 | deleteProvider 不清理 governor | **已修复**：删除时 removeProviderLimits + 清空窗口 |
| I7 | 🟢 | 新文件缺末尾换行 | 已补 |

## 验证
- 聚焦套件：api-usage-governor 17 / model-provider-governor 6 / story2video-stages 52 / model-call-scheduler 13 / useModelProviderCrud 49 / ai-generator / multimodal / preset-integration —— 全绿（85+ passed 每轮）。
- ops-center：pytest 64 passed、前端 build 通过。
- 桌面全量 vitest：运行中（约 6750 用例）；最终 4 个窄修复由聚焦套件覆盖。

## 残余边界
1. 桌面端与 ops-center 无运行时同步（种子手工对齐 + PRD 契约，后续项）。
2. 5h 窗口为「请求完成后记账」语义：窗口填满后的下一次请求在预检被拒（不再消耗调用），触发当次为安全保守行为；PRD 注明。
3. requests 计数口径 = 成功完成的受管调用（本地占位/断点复用也计），PRD 注明为成功编排请求计数。
4. 真实 provider 每分钟限额以 governor 429 自适应兜底。
