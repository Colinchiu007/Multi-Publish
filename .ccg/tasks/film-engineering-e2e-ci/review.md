## 双模型审查结果

审查对象：`.github/workflows/build.yml` 新增电影工程真实 E2E 步骤、`apps/desktop/tests/e2e/film-engineering-real.js` 路径/定位加固、OpenSpec change `film-engineering-real-e2e-ci`。

### opencode

- Critical：GitHub Hosted `windows-latest` 的 GUI 会话能力未经实测；上线硬门禁前必须先在该 runner 上跑通一次，失败时不得合并。
  - 处置：通过本 PR 的 Build & Release Windows job 实测闭环；CI 未绿前不合并，避免影响其他 PR。
- Major：生成按钮定位存在歧义，可能命中工具栏以外的相同文案按钮。
  - 处置：定位改为 `page.locator('.fe-shots').getByRole(...)`，并复用同一 locator 点击。
- Minor：E2E 进程继承完整 CI env；`if-no-files-found: warn` 可能吞掉证据；`生成失败` 被视为可分类。
  - 处置：保留现有 env 继承（测试脚本需要 Electron 相关变量），上传仍用 `always()` + warn 兜底；生成失败分类维持现状，避免把外部 Provider 阻断误判为失败。

### claude

- Critical：无。步骤顺序、pnpm 工作目录、上传 glob、workflow 契约测试均验证通过。
- W1 输出路径依赖 pnpm 隐式 cwd → 已修复：脚本将 `FILM_E2E_OUTPUT` 按仓库根解析，workflow 传 `apps/desktop/tests/e2e/reports/film-engineering-real`。
- W2 Windows runner GUI 稳定性 → 已加 job `timeout-minutes: 60`；首个 CI 周期观察 flake，若基础设施性失败再考虑受控重试。
- W3 报告目录未忽略 → 已加入 `.gitignore`。
- W4 film-kit 打包完整性缺少独立断言 → 保留为残余风险，当前 E2E fail-closed 已能捕获；后续可在 before-pack 增加 asar 清单断言。

### 结论

无 Critical 未处理项。推送 PR 后以真实 windows-latest 运行结果为最终验收；合并前必须看到 Build & Release Windows job 的 E2E 步骤通过并上传 `film-engineering-real-e2e` artifact。

### CI 实测（第一次）

- windows-latest 可启动打包 EXE：Electron 进程、主窗口、电影工程入口、film-kit、162 场景、分镜列表、详情抽屉均通过。
- 失败点：runner 默认英文界面，脚本按中文“批量复制”等文案定位导致 30s 超时。
- 处置：E2E 增加 `--lang=zh-CN`，并在分镜工具栏/详情抽屉按钮补充稳定 `data-testid`，已提交等待重跑。
