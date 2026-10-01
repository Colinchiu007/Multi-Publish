# 工程门禁：app.asar 不得打进单元测试文件（#2702）

- 日期：2026-10-01
- 分支 / PR：`fix-asar-exclude-test-files` / #2736
- 类型：🔧 打包配置 + 工程门禁（**零运行时代码**）
- 实现来源（不占他人成果）：门禁脚本与 `build.files` 排除声明的第一版来自并发会话遗留的**未提交**
  工作区 `mp-asar-exclude-test-files`（最后写入 2026-09-30 10:34，此后 15 小时无动作）。本 PR 逐文件
  复核后采纳，并补齐它缺的自证接线一环；原工作区未被改动。

## 1. 问题与量化

`apps/desktop/package.json` 的 `build.files` 原来只有三条整目录通配（`dist/**/*`、`electron/**/*`、
`node_modules/**/*`）加三条与本问题无关的排除，**没有任何测试文件排除**；而本仓约定单测与被测代码
同目录（`{被测文件}.test.js`）。于是 `electron/**/*` 把主进程单测整批打进 `app.asar`。

同一台机器、同一 `--config.electronDist`（electron 43.1.1）的两次打包实测对照：

| | asar 条目总数 | `.test.*` 条目 | `electron/tests/` 子条目 | `.js.map` |
| --- | --- | --- | --- | --- |
| 未加排除（#2701 那轮产物） | 15,214 | **467** | 51 | 1,469 |
| 加排除（本 PR 产物） | 14,743 | **0** | 0 | 1,469 |

467 条 = `electron/` 418 + workspace 包 `@multi-publish/shared-utils` 21 + 第三方 23；其中还含
**3 个 `.test.ts`**（`apps/desktop/electron/core/container.test.ts` 实测进过产物），所以排除按**族**收齐。

代价不只是体积：测试里含内部接口形状、mock 的平台端点与错误码字符串，等于把内部契约地图随安装包
发给用户侧（本仓有 `credential-store` / OIDC / 云账号同步等内部面）。

⚠️ 取证口径：`asar list` 在 Windows 上返回**反斜杠**路径，按 `/` 前缀匹配会把 14,743 条全判成
「0 命中」。本仓第一版探针就给出了这个假结论，判据必须先归一化。

## 2. 方案

### 2.1 排除集

```
"!**/*.test.js", "!**/*.test.mjs", "!**/*.test.cjs", "!**/*.test.ts", "!**/*.test.tsx",
"!electron/tests/**"
```

目录排除那条是必要的：`electron/tests/story2video-real-ffmpeg.node-test.cjs` 用的是
`{被测}.node-test.cjs` 命名，五条扩展名通配抓不到它。该目录唯一的非 `.test.` 命名文件就是它本身
（按定义仍是测试），且全仓无生产代码引用 `electron/tests/` ⇒ 整目录排除只删测试。

### 2.2 两个正交维度（各自都看不见对方的失败）

- `--config`：静态读 `build.files`，断言六条排除仍在原位。挂在 `quality-gate.yml`，CI 每次必跑，成本≈0。
- `--asar`：读真实产物清单，断言测试条目数为 0。挂在 `build.yml` 打包步骤之后，条件与打包步骤
  **逐字一致**。原因：electron-builder 对 `node_modules` 另走依赖遍历收集，把排除写窄成只管
  `electron/` 目录时静态检查看不出来（实测 44/467 来自 node_modules），只有真清单能证明；
  反过来只测产物，则任何一次「打包被跳过」都会让门禁静默消失。

### 2.3 反向偏置

`build.files` 读不到 / 非数组 / 为空 ⇒ **抛错**，不返回「通过」；asar 文件不存在 ⇒ 抛错；
清单为空 ⇒ 判 `unverifiable`（一次不完整的枚举报「全绿」比报不出来更危险）。

### 2.4 本 PR 补的一环：自证接线

采纳版没有断言「这两个维度还挂在会执行它们的 workflow 里」——把 `build.yml` 那一步删掉，本地**不会红**，
只是 CI 静默失去产物维度覆盖。新增 `checkWiring` + `readWorkflowBodies`，按**可执行正文**匹配
（注释里提一句不算接线，与 `scripts/check-unwired-tests.js` 同口径），并挂在 `--config` 主路径上。

**残余死角（写明，不假装消除）**：该锁自身由 quality-gate.yml 那两行驱动，把那两行**一起**删掉时它不会
变红。任何自证接线锁都有这个死角，靠 `check-unwired-tests.js` 的棘轮兜（变异 N8 实测它 rc=1 且点名本脚本）。

### 2.5 命名完整性反查

`TEST_FILE_RE` 是「想到哪几族就锁哪几族」的白名单，新增一族命名（如 `foo.test.vue`）时白名单不会自动变红，
产物就会**静默**开始混入该族测试。`checkNamingCensus` 扫 tracked 文件、限定打包域
（`apps/desktop/`、`packages/`），凡 basename 含 `.test.` 却不被判据覆盖即红，并带**规模下界**断言
（实测 977 个），防止解析退化成空集合后「0 漏族 = OK」的假绿。

## 3. 验证

- 夹具 `.github/scripts/check-asar-test-files.test.js` → **23 pass / 0 fail**（采纳 17 + 本 PR 5）。
- **11 条变异**逐个实跑并点名失败用例：N1 少一条扩展名排除→1 红 · N2 写窄成只管 electron→1 红 ·
  N3 `TEST_FILE_RE` 去掉 ts/tsx→**4 红**（判定表 + 同族 parity + 命名反查 + 规模下界）· N4 空清单判为通过→1 红 ·
  N5 不剥注释→1 红 · N6 摘 `--asar` 步骤→3 红 · N7 降级成注释→3 红 · N8 摘 quality-gate 两行→
  `check-unwired-tests.js` rc=1 且点名本脚本 · N9 删排除后 `--config` CLI status=1 ·
  **N10/N11 把 `checkWiring` 判据改成 `if (false)`→3 红 / 1 红**（「把锁本身改成 no-op 必须立刻变红」）。
  还原后 23/23 绿、被改文件字节级一致。
- QM-1 打包：`build:vue` rc=0、`electron-builder --win --dir` rc=0、`--asar` 维度 rc=0；
  产物 exe 以独立 `--user-data-dir` 启动**存活 16s**、`IPC handlers registered`、**stderr 0 字节**、
  六项禁项（`Failed to load platform config` / `PluginLoader` / `ENOTDIR` / `Cannot find module` /
  `Uncaught` / `MODULE_NOT_FOUND`）各 0 次 ⇒ 「按 glob 扫描 `*.test.js` 当业务模块加载」的误触风险未发生。
- 运行时文件仍在包内：`/dist/index.html`、`/electron/main.js`、两个 `*.bundle.js`、
  `auth-view-manager.js`、`auth-partition.js`、`@multi-publish/{rpa-engine,shared-utils}/package.json`。

## 4. 一次自我否证（记下来，因为它差点变成一条装饰性锁）

第一版「注释不得进入可执行正文」的断言写成 `doesNotMatch(/#.*check-asar/)`，而真实注释块里**并没有**
`check-asar` 字样 ⇒ 剥不剥注释都通过。N5 首轮实跑 `status=0` 暴露了它。改为在 `os.tmpdir()` 造一份
真实 workflow 目录，断言三件同时成立：原文里字面存在、剥完必须消失、可执行行必须留着——N5 才真的变红。
同轮另一处坏探针：把 `checkWiring` 改成 no-op 时我先跑了 CLI（测的是错的东西），改为跑夹具后才拿到预期的 3 红。

## 5. 边界与未做

- **不夹带 source map**：同一次实测发现产物内有 1,469 个 `.js.map`，量级比测试文件更大，但
  「生产包是否带 source map」是独立的产品/排障决策，不在「测试文件不该进包」这条判据里顺手处理。
- 只锁 `.test.{js,mjs,cjs,ts,tsx}` 五族 + `electron/tests/**`；`*.spec.*`、`__tests__/` 等其它命名不在本判据内
  （若将来启用，`checkNamingCensus` 会在**当天**变红，而不是悄悄进产物）。
- CHANGELOG 条目由后续 docs PR 同批带上（置顶型文档撞车面降到 0）。

## 6. 防再犯口径（可复用）

- 新增一条「全域排除」型门禁时，必须同时回答：**声明维度**与**产物维度**各由谁守、以及
  **接线本身**由谁守；三者缺一都会留下「看起来在守、实际恒绿」的形态。
- 判据是白名单时，必须有一条拿**仓库真实分布**反查白名单覆盖度的锁，并带规模下界。
