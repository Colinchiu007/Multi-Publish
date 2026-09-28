# Tasks: publish-capability-registry

- [x] 1. 注册表核心（TDD：先测后码）
  - [x] 1.1 `packages/shared-utils/src/__tests__/publish-capabilities.test.js`：15 平台 meta 完整性、无标题清单 = 6 平台精确断言、classifyPublishFields（collection=5 common / visibility=5 common / download=2 semiCommon / digest=1 unique）、composeNoTitleDescription（空值/截断/标题优先）、限制表快照、双版本 parity、结构自检（58 例全绿）
  - [x] 1.2 `packages/shared-utils/src/publish-capabilities.js`（CJS）实现至绿
  - [x] 1.3 `packages/shared-utils/src/publish-capabilities.browser.js`（ESM 孪生，读同一份 JSON）+ 导出完整性/parity 测试
  - [x] 1.4 shared-utils index.js 导出登记（publishCapabilities）
  - [x] 1.5 参考产品 4.13.19 逆向取证扩充矩阵（用户指定参考）：visibility 5 平台 / location 3 / goods 4 / collection 5 / activity 3 + 20+ 平台独有项（status=platform-capable + note 证据）

- [x] 2. 渲染层接入
  - [x] 2.1 `publish-contract.js`：limits 改注册表派生（对外 API 不变）；`validatePlatformContent` 无标题平台合并长度校验 + 新用例（22/22 绿）
  - [x] 2.2 `PlatformOverridePanel.vue` 数据驱动重构：字段清单快照测试（8 平台 × 既有字段零丢失）先行，模板/defaultOverride/normalizeValue 改注册表驱动（10/10 绿）
  - [x] 2.3 `Publish.vue`：通用字段支持度标注（N/15 徽标）+ 无标题平台标题提示（视频/图文两分支，54/54 绿）+ Vite alias
  - [x] 2.4 `locales/zh.js` + `en.js` 成对文案（fieldSupport / noTitleHint；Gate 7 四项检查全过，CJK 基线 1489→1342 净减 147 条）

- [x] 3. 主进程与引擎
  - [x] 3.1 `rpa-view-platforms.js`：`_publish_generic` 无标题平台显式跳过 title_input（结构锁 + weibo 行为锁 + 快手断言反转，43/43 绿）
  - [x] 3.2 `shipinhao-video.js`：description = 标题首行 + 正文（修复标题丢弃，shipinhao-adapter 测试更新至新语义）
  - [x] 3.3 `adapters/twitter.js` / `weibo.js` / `tiktok.js`：同口径合并（引擎全量 run-tests.js 通过）
  - [x] 3.4 `packages/api-publish-engine/test/no-title-contract.test.js`：A 清单 / B 行为 / C 反向三向契约锁（8/8 绿，含反证口径）

- [x] 4. 文档
  - [x] 4.1 `01-docs/PRD-PUBLISH-CAPABILITY-REGISTRY-2026-10-08.md`：全量能力矩阵（含参考产品取证项）、数据校验、流程、功能/交互逻辑、显示项、提示文字、测试验收、roadmap
  - [x] 4.2 主 PRD 登记（功能文档列表）+ CHANGELOG 追加
  - [x] 4.3 `01-docs/learnings.md` 置顶经验条目（5 条，+8/-0 干净落地）
  - [x] 4.4 design.md 补参考产品证据源章节（§1.5）

- [x] 5. 记忆三路
  - [x] 5.1 内置记忆（会话目标状态锚点，goal 持续跟踪）
  - [x] 5.2 外部记忆（learnings.md 置顶 + PRD + CHANGELOG + openspec）
  - [x] 5.3 EverOS：HTTP `POST /api/v2/memory/add`（accumulated）+ `flush`（extracted）+ md-first 直写 episode（dsh/Mulpub-17875af60fc6 分区 episode-2026-09-28.md 第 5 条，服务端 cascade 卡死期兜底，恢复后自动索引）

- [x] 6. 交付
  - [x] 6.1 全量相关测试本地通过：shared-utils 394 / 桌面发布面 13 文件 348 / rpa-view-platforms 43 / 引擎全量（含契约锁 8）
  - [ ] 6.2 提交（pre-commit 分支守卫）→ push → PR → CI 绿 → auto-merge（进行中）
