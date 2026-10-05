## 1. 取证基线（不改任何代码，先量化存量）

- [ ] 1.1 从 `apps/desktop/src/api/**` 静态抽出全部 `invokeWithFallback("<调用名>", ...)` 的调用名，与 preload 真实暴露面（扁平键 ∪ 各命名空间成员，按 D4 用 `createXxxApi` 工厂函数取，不手抄）求差集，产出存量清单并落 `docs/ipc-exposure-contract.md`。**本任务只出清单，不改代码**——后续所有工作量取决于这份清单的实际规模
- [ ] 1.2 逐条判定差集：每项标注「真实缺陷（调用侧写错名）」/「误报（判据欠精确）」/「动态取名（静态判据固有边界，见 D3 ①②）」，并给出证据（源码行号 + 暴露面实际键）。**禁止**为了让后续门禁变绿而在这一步放宽判据
- [ ] 1.3 若 1.2 判定的真实缺陷数 > 8，本 change 超出单会话范围，按批次拆分并在 proposal 里登记拆分口径；若 ≤ 8 则本 change 一次做完

## 2. TDD：契约测试（先红后绿，红必须是真红）

- [ ] 2.1 新增 `apps/desktop/electron/tests/ipc-exposure-contract.test.js` 骨架：按 D4 从 preload 工厂函数取真实暴露面。**测试目标**：能稳定取到暴露面且键数与 `preload.test.js` 的总数锁一致（同一真源，不允许第二份清单）
- [ ] 2.2 判据矩阵单测：正例逐条取自 `origin/main` 修复前的真实原形（含 `filmEngineeringRetryShot` 扁平形态、成员空格、方括号访问、可选链、跨行、命名空间成员），负例含合法演进写法。**测试目标**：矩阵自身正确；断言必须用 `.length).toBe(1)` 而非 `toBeTruthy()`——空数组同样 truthy，会让判据对"恒返回空数组"的 no-op 完全免疫
- [ ] 2.3 扫描域棘轮自检（spec 第 3 条）：`src/api/**` 下每个含 `invokeWithFallback(` 的文件都必须在显式清单内。**测试目标**：新增一个未登记的含调用文件时判红
- [ ] 2.4 **红证据**：以 1.2 清单里的真实缺陷为变异注入（从 `filmEngineeringRetryShot` 开始），跑测试确认对账测试判红并点名该调用名。**先证明锁会红，再谈修绿**——若此处不红，后续全部门禁都是装饰
- [ ] 2.5 反证：把判据改成恒返回空数组，确认 2.2 矩阵**判红**（即矩阵不是装饰性断言）；确认后逐字节还原

## 3. 修 C-1（让失效功能恢复）

- [ ] 3.1 按 D1 改 `apps/desktop/src/api/publisher.js:396`：`filmEngineeringRetryShot` 改走 `filmEngineering` 命名空间取 `retryShot`。不改 preload 暴露面、不改主进程 handler、不改 IPC channel
- [ ] 3.2 按 D2 给 `useFilmProduction.js:280` 与 `useFilmVideoGen.js:237` 的失败分支补可读错误文案（当前恒 `res.code === 0` 为 false 且界面零反馈）。**测试目标**：新增用例断言失败分支产出用户可见提示，且提示文案走 `locales/zh.js` + `en.js` 成对登记
- [ ] 3.3 复跑 2.4 的对账测试确认转绿；跑 `preload.test.js` 确认暴露面侧无回归（键数与转发矩阵不变）

## 4. 存量修复

- [ ] 4.1 按 1.2 结论逐条修真实缺陷，每批一个会话；每批必须附"该调用名从错到对的证据"（调用侧旧行 → 新行 → 暴露面实际键）
- [ ] 4.2 误报项与动态取名项登记为显式白名单（形态对齐 `settings-roundtrip-contract.test.js` 的 `KNOWN_LAGGING`），并在测试里写明**白名单只能缩小**：扩了转发/改了写法必须当场销账
- [ ] 4.3 禁止的捷径（自检用）：不得为了让门禁变绿而放宽判据正则、不得把整份 `src/api/**` 扫完却对差集静默、不得把 C-1 单独修掉而不做 2.4 的对账

## 5. 门禁接线与收口

- [ ] 5.1 把 `ipc-exposure-contract.test.js` 接入 quality gate 必检项，且为**阻塞级**（非 advisory）。若 `affected-test-selection` 机制适用，同步登记
- [ ] 5.2 门禁级反证：构造两个变异——① 新增一处不存在的调用名；② 从 preload 移除一个仍被调用的方法——确认 CI 判红且阻塞
- [ ] 5.3 QM-1 打包验证：改了 `apps/desktop/src/` 与 `apps/desktop/electron/`，必须本地 `electron-builder` 打包通过并确认启动无 stderr 白屏（重点：preload 在 sandbox:true/false 两种模式下 `window.electronAPI` 均可用）
- [ ] 5.4 QM-2 必检项复核：所有新增/改动 IPC 调用参数为纯 JSON（Vue ref/reactive 嵌套对象须脱壳后再传）
- [ ] 5.5 文档同步：根因与逃逸链写入 `01-docs/learnings.md`；CHANGELOG 收口；写 `openspec/records/<分支>.md` 执行记录
- [ ] 5.6 归档三同步：`openspec archive` + CCG task 归档 + 质量节拍复盘，用 `scripts/openspec-sync-check.js` 确认不新增违规
