# Tasks

## 1. film-kit 数据资产（P0）

- [x] 1.1 从全量语料（items/*.jsonl）生成 film-manifest.json（162 场景树 + 电影元数据），校验 schemaVersion=1
- [x] 1.2 生成 shot-library.json（代表性分镜：status=completed 且 prompt 非空的最终稿，视频 job 优先），含 shotId/sceneId/prompt/model/refTokens/resultUrl
- [x] 1.3 生成 reference-registry.json（全库 token 索引：角色/场景/道具 + 图 URL），token 解析优先级 job id > input_images id
- [x] 1.4 生成 prompt-doctrine.json + prompt-doctrine.zh.md（块模板 + 五条铁律 + 词汇表，中英双语）
- [x] 1.5 下载精选参考图（4 角色 + 8-12 场景/道具 min 版）至 film-kit/images/，kit 总量 <=5MB
- [x] 1.6 编写 film-kit/SCHEMA.md（schema 与校验规则）与 scripts/film-engineering/fetch-hell-grind-kit.py（可复现重建）
- [x] 1.7 film-kit 加载器测试：缺文件/坏 JSON/schema 非法/token 格式错 → fail-closed（film-kit-loader.test.js）

## 2. 主进程服务（P1）

- [x] 2.1 services/film-engineering/kit-loader.js：加载 + schema 校验 + FILM_KIT_UNAVAILABLE
- [x] 2.2 services/film-engineering/shot-library.js：listScenes/listShots/getShot/buildCopyText（4 种复制模式）
- [x] 2.3 services/film-engineering/script-adapt.js：分场 → Hell Grind 模板映射 → adaptedShots（同构输出）+ 可选 LLM 润色降级
- [x] 2.4 服务测试：shot-library.test.js（查询/非法 id/复制文本）、script-adapt.test.js（分场/模板映射/角色绑定/超长拒绝/LLM 降级标记）
- [x] 2.5 script-adapt 契约测试：adaptedShots 与 kit shot 同构、可被 generate-selected 消费（film-engineering-adapt-contract.test.js）

## 3. 流水线与 IPC（P2）

- [x] 3.1 pipeline-engine.js PIPELINES 注册 film-engineering（参考 story2video 模式）
- [x] 3.2 stages 文件（film_load_template / film_adapt_script / film_select_shots / film_export_prompts）遵循 StageExecutor 契约（checkpoint/进度/错误）
- [x] 3.3 container.setup.js 注册 film-engineering 服务 + IPC handlers
- [x] 3.4 ipc-handlers/film-engineering.js：withSenderCheck + 入参运行时校验（script<=10000、characterMap<=10、shots<=50）
- [x] 3.5 测试：film-engineering-stages.test.js（4 阶段链/checkpoint/错误）、film-engineering-ipc.test.js（校验/sender/FILM_KIT_UNAVAILABLE）
- [x] 3.6 回归：pipeline-engine 既有测试通过

## 4. 前端（P3）

- [x] 4.1 路由 /film-engineering + 三栏视图骨架（FilmEngineeringView）
- [x] 4.2 FilmShotList.vue：场景树（加载骨架/空态+重试/搜索过滤）+ 分镜列表（勾选）
- [x] 4.3 FilmShotDetail.vue：提示词全文折叠/参考图/模型标签/ref 解析/复制按钮组
- [x] 4.4 FilmScriptAdapt.vue：剧本输入（<=10000 字符计数）+ 角色映射 + 结果列表（复制/加入选择）+ LLM 降级提示
- [x] 4.5 操作面板：勾选汇总、复制全部、生成图片（provider 未配置引导设置页）、导出 JSON/Markdown
- [x] 4.6 composable film-engineering.js + 测试（IPC 非空数据 → 响应式状态转发；空态/错误路径）
- [x] 4.7 locales zh/en 成对新增全部文案 + pipeline-labels 注册 + i18n-glossary 产品名词

## 5. 文档（P4）

- [x] 5.1 01-docs/PRD-video-creation.md 新增 3.1.23 影视工程流水线（功能逻辑/数据校验/交互逻辑/显示项/提示文字全量详写）
- [x] 5.2 01-docs/ARCH-FILM-ENGINEERING-2026-08-14.md（架构精化版）
- [x] 5.3 01-docs/learnings.md 复盘（语料下载 API/kit 设计取舍/fail-closed 决策）

## 6. 交付（P5）

- [x] 6.1 质量门禁：测试全绿（服务/契约/前端/回归）+ locale 成对 CI Gate 7 + .quality-gates.md 自检
- [x] 6.2 双模型审查（antigravity + Claude）并修复 Critical/Warning —— 已降级为主代理自审（antigravity 地区不可用 / Claude 未登录 / 子代理 403），结论见 .ccg review.md
- [x] 6.3 OpenSpec tasks 全部勾选 + openspec validate 通过
- [x] 6.4 CCG task.json 更新 + 三同步归档（openspec archive + CCG archive + 质量节拍复盘）
- [x] 6.5 push 分支 → PR → CI 通过 → 合并 → 记忆更新
