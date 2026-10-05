# `deps.inline:['electron']` 评估：不摘（且"摘了能根治 #2794"这句推测被实测否证）

> 任务 #33。评估对象：`apps/desktop/vitest.config.js:17` 的 `deps: { inline: ['electron', 'axios'] }`
> （自 `f3be64a8e`，2026-07-05「Phase 3+4: Electron 测试 (61 tests)」起存在，提交信息未写原因）。
> 触发点：`#2797` 的执行记录把它登记为「FA A2 未评估」，随后 `docs/blanket-fs-mock-ratchet.md`
> 把它复述成"摘掉它会让这条链从根上消失"。**本 PR 用一次两分钟能重跑的 A/B 否证了那句推测。**

## 1. 结论

**保持现状（不摘）。** 理由按分量排：

1. **摘掉它并不能断掉 #2794 那条链**——这是主要发现，也是对既有文档的纠正。
   同一支探针（形状 = 现场最坏情况：blanket 谎报 `fs` + **不**启用 electron mock + `require('electron')`）
   在两种配置下各跑一次：

   | 配置 | 是否打印 `Downloading Electron binary…` | 之后抛什么 |
   |------|----------------------------------------|-----------|
   | `inline: ['electron', 'axios']`（现状） | **会** | `Electron failed to install correctly…` |
   | `inline: ['axios']`（摘掉 electron） | **一样会** | **同一句话，逐字相同** |

   ⇒ `electron/index.js` 在测试 realm 里被执行**不由这个开关决定**。本仓桌面测试是 `environment:'jsdom'`
   下的 CJS 混合加载，被测服务模块自己 `require('electron')` 走的是 `Module._load` 那条路（与
   `test-setup.js` 的 `__registerMock` 同一层），vite 的 inline/external 分流管不到它。
   **所以不存在"改一行配置就不用管夹具"的退路；唯一控制点是夹具形状本身**
   （`scripts/check-blanket-fs-mock.js` 那条棘轮）。

2. **摘掉它也拿不到任何收益**（就本次测量所及）：三条模块身份探针在两种配置下**输出逐项相同**
   （见 §3 的 P1/P2/P3），桌面全量 736 文件 / 13492 例在两种配置下**结果完全一致**
   （各 `1 failed / 734 passed / 1 skipped`，唯一红是既知的 `feedback.test.js` Windows symlink `EPERM`）。

3. **摘掉它会让既有核对结论失去可比性**：`KNOWN_BLANKET` 那 12 条"本文件为什么安全"的理由
   全部是在现状配置下逐文件核对出来的（例如"`vi.mock('electron')` 已被 vitest 提升到文件体之前
   ⇒ 真 `index.js` 不进本 realm"）。换掉模块加载分流方式 = 要求这 12 条重新核对，而收益是 0。

## 2. 可重跑的评估方法

```bash
# 1) 只动一行配置
sed -i "s/inline: \['electron', 'axios'\]/inline: ['axios']/" apps/desktop/vitest.config.js
# 2) 同一支临时探针各跑一次，读 [AB] 那一行（探针见 §4，跑完即删、不入库）
cd apps/desktop && pnpm exec vitest run electron/tests/zz-ab-inline.test.js
# 3) 需要规模判据时再跑全量（约 19 分钟，maxWorkers:1）
pnpm exec vitest run
# 4) 复原并证明复原
git checkout -- apps/desktop/vitest.config.js
git diff --exit-code origin/main -- apps/desktop/vitest.config.js
```

## 3. 三条模块身份探针（P1/P2/P3）为什么"两配置相同"仍然支持结论

- **P1**：`vi.doMock('electron', …)` 之后 `await import('electron')` 的 `app` 可见性；
- **P2**：未 mock 时 `import('electron')` 的形状（是否 interop 壳、是否字符串路径）；
- **P3**：`__registerMock('electron', …)`（`Module._load` 那条路）是否命中。

两配置下三者输出**逐字相同**（`P1 {type:object, hasApp:false}`、
`P2 {type:object, isString:false, keys:[default, module.exports]}`、`P3 MOCKED-BY-MODULE-LOAD`）。
**诚实标注其边界**：P1/P2 这种"动态 import + 运行期 doMock"的组合本身对 inline 开关**不敏感**
（它没有断言任何配置相关变量），所以它们**既不能支持也不能反对**"inline 是否影响 mock 生效"——
它们在本评估里的作用是**否证性的**：没有任何一条出现"配置一变行为就变"的信号。
真正支撑结论的是 §1 表格里那条 A/B（探针会真的走进下载分支并打印 banner，说明它确实在测量目标行为）
与全量跑的一致性。**如果将来要主张"摘掉 inline 会改变 `vi.mock` 的适用域"，必须换一个能区分两者的判据**
（例如：让某个文件的 `vi.mock('electron')` 故意返回一个可断言的哨兵值，再看两种配置下哨兵是否还在），
不要用 P1/P2 当证据。

## 4. 探针为什么刻意不入库

两支临时探针（`zz-probe-deps-inline.test.js` 摸模块身份、`zz-ab-inline.test.js` 摸"谎报 fs 后会不会走进下载分支"）
测的是**配置差异**而非产品行为。留着它们等于留两条永不自证的"气候探针"：配置一改就得同步改断言，
而没有任何门禁会因为产品坏掉而让它们变红。收口时连同 `vitest.config.js.bak` 一起删除，
并用 `git status --porcelain`（空）+ `git diff --exit-code origin/main -- apps/desktop/vitest.config.js` 自证复原。
**评估期把实验文件留在工作树里，会被下一次 `git add -A` 顺手带进提交**——这条是本仓既有的"评审残留"同族。

## 5. 未做的部分（不假装已闭合）

- **这行当初为什么加**：提交信息没写原因，`test-setup.js` 的注释解释的是 `Module._load` 拦截
  （那恰恰是**不依赖** inline 的机制）。查清原始动机需要改跑法做考古，成本高、对本次决定无影响，未做。
  本文只证明"**现在**摘它无收益"，不证明"它从来没有作用"。
- **`axios` 那一半没评估**：只判了 `electron`。`axios` 的 mock 面（渲染层 `vi.mock` vs 服务层构造注入）
  与 electron 不同形，**不能套用本文结论**。
- **没做 `vi.mock` 适用域的正向判别**：见 §3 末尾那句——本次留了一个可做的实验设计，但没跑。
