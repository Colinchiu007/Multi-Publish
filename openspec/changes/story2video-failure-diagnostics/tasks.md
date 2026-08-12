## 1. 诊断码 taxonomy（纯函数，TDD）

- [x] 1.1 新增 `apps/desktop/electron/services/diagnostics/taxonomy.js`：导出 `DIAG_STAGES`（preflight/split/domain_enrich/optimize/generate_assets/compose/publish）、`DIAG_FAILURE_TYPES`（validation/transient/provider/infrastructure/timeout/resource/media/content_policy/partial_degradation/unknown）、`DIAG_SEVERITY`（blocker/major/minor/info）、`DIAG_RECOVERABILITY`（retryable/degradable/checkpoint/needs_user_input/permanent/unknown）
- [x] 1.2 实现纯函数 `classifyFailure(input)`：从 errorCode/code/message 归一化 stage、failureType、severity、recoverability；空/非对象/未知枚举 fail-closed 到 unknown 桶，稳定结构、不抛错
- [x] 1.3 新增 `taxonomy.test.js`：覆盖已知失败可分类（compose+timeout→blocker/retryable）、未知输入 unknown 桶、稳定结构断言（测试目标：spec「失败样本统一分类」两个场景）

## 2. 根因候选映射（纯函数，TDD）

- [x] 2.1 新增 `services/diagnostics/root-cause-map.js`：声明式规则表（errorCode/code/message pattern → 候选根因 causeId/label/checks/advice/confidence），导出 `lookupRootCauses(classification, error)`
- [x] 2.2 规则至少覆盖：sidecar 不可用（ECONNREFUSED/not running/端口）、ffmpeg/媒体（ENOSPC/ERR_NO_BUFFER_SPACE/编码器/Output file is empty）、provider 瞬时（429/限流/超时/网络）、内容政策（内容审核/政策）、配置缺失（API Key/未配置）；未命中返回低置信度 unknown 候选
- [x] 2.3 新增 `root-cause-map.test.js`：命中规则（ECONNREFUSED+split/optimize → sidecar 候选带 checks/advice）、未命中通用建议、候选字段完整性（测试目标：spec「根因候选映射」两个场景）

## 3. run 诊断摘要与环境快照（TDD）

- [x] 3.1 新增 `services/diagnostics/run-diagnostics.js`：`buildRunDiagnostics(run, envSnapshot)` 纯函数（stage 明细 + 失败分类 + 根因候选 + 环境快照），输出为纯 JSON 可序列化对象
- [x] 3.2 实现 `captureEnvSnapshot(deps)`：os 内存/CPU/uptime + 磁盘余量（statfs try/catch，失败 null）+ 可选 ffmpeg/ffprobe 可解析性 + 可选 sidecar 运行标志；整体永不抛错
- [x] 3.3 新增 `run-diagnostics.test.js`：序列化无循环引用、脱敏（不携带 errorParams 原文）、单项采集失败为 null 不抛错（测试目标：spec「环境快照 best-effort」「诊断样本可序列化」「诊断输出脱敏」）

## 4. pipeline-engine 附加字段（additive，回归）

- [x] 4.1 `pipeline-engine.js` `_finalizeRun` 附加 `run.diagnostics = buildRunDiagnostics(run, captureEnvSnapshot(deps))`（try/catch 包裹，失败仅记 warn 不改变终态）
- [x] 4.2 更新/新增测试：断言成功/失败 run 均附加 diagnostics、既有字段与断言不变（测试目标：spec「诊断附加字段契约」）

## 5. 聚焦验证与质量门禁

- [x] 5.1 运行新增 3 个测试文件 + `pipeline-engine.test.js` + `stage-executor.test.js`，全部通过
- [x] 5.2 (eslint 0 error; prettier 仓库基线本身不满足，未强制) `npm run lint`（apps/desktop）与 `npm run format --check` 通过（或格式化）
- [x] 5.3 (Claude reviewer 完成；antigravity 地区不可用降级单模型；Critical/Warning 已修复并补回归) 双模型审查（antigravity 不可用时降级单模型 claude reviewer），Critical 修复后复跑
- [x] 5.4 (QM-1 打包通过：electron-builder --win --x64 exit 0；asar 含 diagnostics；启动 10s 存活、主窗口显示、stderr 无配置/插件/ASAR 错误) (打包 QM-1 验证中) 提交（codex/video-diag-system 分支）→ 推送 → 创建 PR（运行时代码必须 PR）

## 6. 收尾

- [x] 6.1 (openspec validate --strict 通过) `openspec validate --change story2video-failure-diagnostics` 通过
- [ ] 6.2 更新 task.json currentPhase=completed；归档（apply 合入 specs 后按「归档三同步」执行）
