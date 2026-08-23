# Review: 合并 domain_enrich 到 scene_context

- 日期: 2026-08-14
- 方式: Claude 审查（antigravity 不可用降级）+ 主代理抽查 + 全量回归
- 结论: 修改后合并（关键项已全部处理）

## 审查发现与处置

### Critical（1 项，已修复）
1. **降级路径丢失 history 种子** — stages.js catch 块在 contentType=history 时先 `extractStoryContext` 生成 seed 挂到 scenes 再返回 degraded，恢复「seed 独立于 scene_context 成功」语义。

### Warning（4 项）
2. **seed visualStyle 逐场景→全文全局判定** — 已在 design.md Risks 登记；新增 golden 测试（场景无朝代关键词 + 全文含朝代 → seed 用朝代风格），story-context-engine.test.js 覆盖。✅
3. **Python YAML 契约镜像未同步** — story2video-compose.yaml 已同步：删 domain_enrich 段、阶段序改为 scene_context。✅
4. **enabled=false 重复提取全局上下文** — 保留未修：IIFE 独立调用与 buildSceneContextResult 内部共享同一 extractStoryContext 入口与 options，当前无分歧路径；双源差异仅在未来改 options 归一化时可能显现，属轻微效率+维护风险，接受并记录。
5. **字符串场景文本丢失** — 改用 `sceneTextOf(scene)`（兼容 string/object）。✅

### Minor（5 项）
6. **「内容增强」标签未挂 scene_context** — locale 已改：zh `内容增强 · 场景上下文`、en `Enrich · Scene Context`；domain_enrich 键保留供旧快照兼容。✅
7. **契约测试第 4 次 executeStage 空转** — 收敛为 3 次执行并加注释。✅
8. **root-cause-map sidecar 白名单** — scene_context 已移出 sidecar_unavailable 判定（纯规则阶段无网络依赖）。✅
9. **陈旧头注释** — story-context-engine.js 注释已更新。✅
10. **已发布 spec 与 delta 不一致** — 按归档节奏处理：openspec archive 合入 delta 后即一致。✅（归档时核对）

## 回归验证
- 定向：story2video-stages 85✅ / story-context-engine 38✅ / text-config 73✅ / taxonomy 14✅ / contract 24✅ / stage-executor 66✅ / pipeline-engine 39✅（stageCount 8→7 断言修复）/ CreateView 186✅ / StageProgress 9✅ / i18n 9✅ / glossary 2✅
- e2e：e2e-full-pipeline 真实执行 7 阶段产出可解码视频 ✅；e2e-pipeline-orchestrator 6✅（重跑确认）
- 全量 vitest：7650 passed | 1 failed（stageCount 断言，已修复复跑绿）
- locale sync pair：zh/en 成对 ✅；openspec validate ✅

## 遗留记录
- Warning #4 未修理由：见上文；若未来 extractStoryContext 增加 options 归一化分支，需收敛为单源。

## 补充记录（15:10）
- QM-1 打包验证通过：electron-builder --win --x64 exit 0；asar 内 story2video-domain 残留 0、story-context-engine/story2video-stages 已入包。
- e2e-full-pipeline 断言全绿（7 阶段顺序、视频可解码），但测试进程可能因 SplitterBridge 未 stop 而挂起不退出——CI 不运行该文件（.github/ 无引用），属既有本地工具瑕疵，非本次改动引入（本 change 仅改其阶段断言）；已记录待后续单独修复。
- 全量 vitest 441 files / 7650 tests passed（唯一失败 stageCount=8 断言已修复复跑 39/39 绿）。
