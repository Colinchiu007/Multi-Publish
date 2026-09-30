<!-- 外部模型评审产物（QM-6 前端路，codeagent-wrapper --backend claude，真源 ~/.claude/.ccg/config.toml [routing.frontend].primary）。首轮只落表头（结论写在被审计工作目录之外被静默拒绝），经 resume 收口为本轮全文。逐条采信/否证与实测反证见 .quality-gates.md 顶部记录的「前端 12 条的处置」。-->

# Review: account-profile-refresh 前端委托审查

审查对象（相对 origin/main 的 diff）：
- apps/desktop/electron/publishers/account-profile-refresh.js
- apps/desktop/electron/publishers/account-profile-refresh.test.js
- apps/desktop/electron/publishers/account-manager.js 中四处委托改动

类别限定：命名 / 模式一致性 / 可维护性 / 集成风险（严格只读，无 git 写操作）。

格式：severity | 文件:行号 | 问题 | 建议

medium | account-profile-refresh.js:13（测试头 :7-8） | 头注释宣称「四条纪律（拆分前后逐字不变）」且测试以「纯平移」定性，但相对 origin/main 有实质行为变更：refreshProfileFromHttpApi 真源 GET 失败时旧码把 curData 降级为 null 继续 PATCH，新码跳过回填返回 false（C1 修正，模块 :116-118 自述）；另头注释纪律条数由旧 JSDoc 三条变四条，「逐字不变」字面不成立。评审与回归按「纯平移」读会漏看行为变更。 | 模块头/测试头明示「拆分 + 一处行为修正（C1）」，并核对 openspec change 是否记录了该变更。
low | account-profile-refresh.js:22-24 | 注释硬编码行号引用（account-manager.js:13、account-manager-profile.test.js:128），文件编辑后行号漂移会误导排查。 | 改为按符号名描述（如「account-manager 顶部解构 tryHttpLoginCheck 处」）。
low | account-profile-refresh.js:50-51、64-65 | 两处连续双空行，与同文件其余单空行分隔风格不一致；若仓库 lint 配了 no-multiple-empty-lines 会直接红。 | 合并为单个空行。
low | account-profile-refresh.js:92-98、121-139 | 拆出后的模块仍以 'AccountManager' 作日志 scope 标签，日志归属与新模块名不符（若运维按标签检索/拆分监控会归错账）。 | 改用 'AccountProfileRefresh'，或头注释声明「沿用旧标签以保日志检索不中断」——二选一，别留两可状态。
low | account-profile-refresh.js:57 | 辅助函数名 requirePathGuard 的「require」易与模块加载语义混淆，且未导出、仅靠行为锁间接覆盖。 | 改名 assertPathGuard / getInjectedPathGuard 等更精确的动词；如需直接单测可导出。
low | account-profile-refresh.test.js:26 | DEPS 桩复制了一份 isSafePathSegment 语义正则；真实现（account-manager 私有）收紧/放宽时测试仍绿但断言失准。 | 复用真实现（接受扩导出面则从 account-manager 导入），或在桩旁注明「需与真实现同步」。
low | account-profile-refresh.test.js:14-16 | 同一测试文件混用 ESM import（vitest 等）与 CJS require(...)，若同目录测试统一为单风格则为偏离。 | 与同目录既有测试风格对齐（全 import+vi.mock 或全 require），消除「该跟哪种」的歧义。
low | account-profile-refresh.test.js:189 | 反向锁正则 [\s\S]{0,200} 假定 GET→PATCH 组合间隔不超过 200 字符，折行或插入局部变量即误报红；虽 AGENTS.md 有显式声明锁先例，此处是锁群里最脆的一条。 | 在锁旁注明「按排版锁、预期折行误报」，或把判据改为语义锁（spy 断言 requestBackend 只经新模块触发）。
low | account-manager.js:684-703 | 拆分后 account-manager.js 仍在 304/1014/1018 行活引用 profileUtils 与 guardProfilePatchBySource（profileForCreate / renameAccount 链路），import 并非死引用；该模块内 updateAccountProfile 等相关路径不在 diff 内，未逐一核验。 | 无需改动；若担心误删可顺手核查一次剩余引用点。
info | account-manager.js:685-687 | 注释「对外导出名与调用签名 MUST 不变」字面只对 extractAccountInfo 两条成立：refreshProfileFromPage / refreshProfileFromHttpApi 在新模块内签名多了 deps 参数（对外经本文件包装仍保持 3 参）。 | 补一句「外部合同经本文件包装保持 3 参；新模块自身要求注入 deps，缺失即抛 TypeError」。
info | account-profile-refresh.js:9-10 | 头注释以 account-name-write.js / account-session-restore.js 为「调用点注入」先例，但本模块注入形态是 deps 对象而非直接函数参数，与先例是否一致未说明。 | 若先例是直接函数参数，注明为何改用 deps 对象形态（或直接对齐先例）。
info | account-profile-refresh.test.js:172-174、account-profile-refresh.js:9-11 | 成环锁只锁「新模块不得直接 require('./account-manager')」，未覆盖经 account-name-write / http-login-checker 的传递 require 成环（CJS 半初始化导出同样会在传递环上发生）。 | 核查两个直接依赖均不传递 require account-manager；如需，补一条传递环锁。

实读文件清单: account-profile-refresh.js（新文件，diff 即全文）、account-profile-refresh.test.js（新文件全文）、account-manager.js（仅改动 hunk：684-703 附近；未读全文，isSafePathSegment 定义与 module.exports 未逐行核实）；未读：account-name-write.js、account-session-restore.js、http-login-checker.js、shared-utils/account-profile、AGENTS.md、openspec change，涉及结论已标注「核实」。