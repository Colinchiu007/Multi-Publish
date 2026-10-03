# QM-6 外部评审原文与处置：P2-8b 发布页「按组添加」（2026-10-03）

> 被审对象：分支 `publish-group-picker`（实现提交 `9c70ffef` + 记录提交 `ae63b192`）
> 评审包：`.qm6/code.diff`（vs merge-base `0e7b2cd2` 的 10 个代码文件，44683 字节）+ `.qm6/prd.md`（本切片 PRD 全文）+ `.qm6/usePlatformSelection.js`（被复用的既有选中集实现，本刀两条顺序约束的成因）
> 通道与偏差：原路由两条均不可用 —— 实测 `Test-NetConnection 127.0.0.1 -Port 15721 -InformationLevel Quiet` = **False**（CC Switch 未运行）。按既有替代通道跑 `opencode run --auto -m <model>`，两轴选**不同底模**：后端 `opencode/nemotron-3-ultra-free`、前端/集成轴 `opencode/longcat-2.5-preview-free`。
> **偏差声明**：产出确为外部模型独立给出，但两轴同经 opencode 一个 harness ⇒ 跨家族独立性打折，**不得记作 codex + claude 双模型 PASS**。
> 回收判据：findings 文件**真落盘且可 JSON.parse**（两轴均 `findings_landed=true findings_parseable=true`），不用 CLI 的 rc。

## 一、结果概览

| 轴 | Critical | Warning | Info | 用时 |
|---|---|---|---|---|
| 后端/逻辑 | 0 | 1 | 5 | 176s |
| 前端/集成 | 0 | 1（+1 条被否证） | 4 | 205s |

## 二、逐条处置

| # | 轴/严重度 | 结论 | 处置 |
|---|---|---|---|
| B-Q3 | 后端 Warning | 非字符串成员被 `filter(typeof id === 'string')` 丢弃后，代码按**过滤后**长度判空组，而 PRD §三 按 `accountIds.length`（原始长度）写判据 ⇒ 例 `[123,null]` PRD 判"2 成员非空"、代码判 `empty-group` | **接受，改文档**：判据本身是对的（归一层 `normalizeAccountGroups` 已经过滤过，走到纯函数还拿到非字符串说明消费者绕过了归一，此时**猜它是成员**才会把用户没放进组里的号发出去）。PRD §三 已补"可判定成员"的定义并把这一格写成显式口径，不再留给读者推 |
| F1 | 前端 Warning | 同一份响应式状态存在 `toggle*`（切换）与 `select*`（只增）两族写入器；建议改名 `ensure*` + JSDoc + 可选运行时警告 | **不接受改名，理由是可达性而非成本**：`applyAccountGroup` 在调用写入器**之前**已用 `isAccountSelected` 短路（已选中的成员进 `already` 分支，不会碰写入器），所以"误传 toggle 就会取消选择"这一路径在本刀**不可达**；真正会出事的落点是未来某个绕过该判据的直接消费者，而那时改名 `ensure*` 同样拦不住（JSDoc 与命名都不是编译器能用的事实）。**保留 `select*` + 注释说明"为什么不用 toggle"**（注释已指向这条纪律）。为假想未来加锁属过度设计，明确不做 |
| F2 | 前端 Warning（**已被实测否证**） | 若 `accounts` 异步填充，chip 会从 `0/3` 跳到 `2/3`，误导用户 | **否证**：`stores/accounts.js` 的 `load()` 里 `accounts.value = res.data`（`:65`）严格发生在 `await loadGroups()`（`:81`）**之前**，而分组只经 `loadGroups()` 进入 store ⇒ 组可见时账号必然已在。唯一残留是 `listAccounts()` 非瞬时失败时 `accounts.value = []` 而分组仍加载 ⇒ 显示 `0/N`，那是**如实**（确实一个都加不了），点击得到 `nothingToAdd` 而不是假成功。已把这条取证写进 PRD §六 |
| F5 | 前端 Info | 组名可含 `{}`（插值）与 `@:`（vue-i18n 链接语法），需测试证明不被二次解析 | **接受并补测试**：新增「组名里的 vue-i18n 元字符只当文本」用例，4 个恶意组名 × 3 条文案（`applyAria`/`added`/`nothingToAdd`）断言 `toContain(原组名)`。实跑 **7 passed**，即 vue-i18n 对**插值值**不做链接/插值递归解析 —— 这是测出来的，不是推断的 |
| F3 | 前端 Info | `buildGroupPickerItems` 丢 `platformFilter`/`accountIds`，未来要展示成员明细时不够 | 不改。展示层按需裁剪是有意为之；"为将来可能需要的字段先透传整个对象"会把哑组件重新变胖 |
| F4 | 前端 Info | 「无组不渲染」牺牲可发现性；建议改既有节点文案或跨页引导 | **登记为已知产品取舍**（PRD §十一 第 5 条）。评审给出的方案 (1) 本身也承认会触发像素门禁 —— 改 `publish` 视图任何已渲染文本都会让 CI 的 `publish-form` 确定性漂红，那正是本刀要避开的；方案 (2)（账号页引导）属另一刀的文案改动 |
| F6 | 前端 Info | `data-testid="group-apply-<uuid>"` 与"既有静态 kebab-case 纪律"不一致，未来 e2e 会脆弱 | **否证其前提**：同一棵子树里既有 `PublishTargetSelector.vue:36` 就是 `:data-testid="'account-' + platform.id + '-' + account.id"`，而 `account.id` 是真实账号 id（uuid 形态）—— **实体键入 testid 是本仓既有先例，不是本刀新造的漂移**。用 index 反而会在分组排序变化时漂移到别的组上，比 uuid 更脆 |

## 三、这次评审实际改变了什么

只有两条落到了代码/文档上（F5 补测试、B-Q3 改 PRD 判据表述），一条被我的实测否证（F2），一条用可达性论证拒绝（F1）。
**但最有价值的一条不在 findings 里**：两轴都没有问到「发布页到底会不会自己去加载 groups」——
若 `loadGroups()` 不在 `load()` 里，本刀的功能在冷启动时永远不可见（用户必须先去账号页）。
我是在核实 F2 的加载时序时顺手把这条查清的（`stores/accounts.js:65` → `:81`），
它说明**外部评审不能替代对宿主调用链的自证**：评审看的是 diff 内的逻辑，跨层时序只有知道去哪读的人才看得见。

## 四、评审者越界写盘核查

两轴跑完各自 `git status --porcelain` 核对：只新增了被指定的那一个 findings 文件（`.qm6/` 整目录不入库，收口时删除）；
两份原文已逐字迁入本文件附录（转述属声明，原文属证据）。

## 五、通道现场：第一次启动是**空跑 15 分钟**（记下来，否则下一次还会踩）

第一次两轴用 `spawn('opencode', [...], { shell: true })` 启动。PATH 上的 `opencode` 是一个**无扩展名的 POSIX shell shim**
（`/d/Program Files/npm-global/opencode`，内容为 `exec "<…>/opencode-cli.exe" "$@"`），cmd.exe 解析不到它 ⇒
子进程从未起来，日志里**只有 START 一行、零观测字节**，而我连续三次轮询都把它读成"评审还在跑"。
真正的判据不是"没红就是还在跑"：① `wc -c` 看日志字节数是否**增长**；② `Get-CimInstance Win32_Process` 按命令行核对子进程是否存在；
③ 给 runner 加**心跳**（每 60s 记 `TICK elapsed_s / observed_stdout_bytes / findings_landed`），让"零观测"必须出声而不是伪装成等待。
第二条同时缺的还有一个必需参数：`--auto` —— 评审者要写 findings 文件，没有它会在权限提示上永久等待（而 stdin 没接）。
改成"直接调真实 exe + 参数数组（无 shell ⇒ 简报里的引号/中文不被二次解析）+ `--auto` + 心跳"后，两轴分别在 176s / 205s 落盘。

## 六、评审原文逐字留证（非转述）

> 上文各表是我的**处置**，属声明；下面两坨是评审者的**原文**，属证据。
> 本文件入库后删除 `.qm6/` 临时目录 —— 否则"评审跑过"这件事在下一次会话里只剩我的转述。

### 后端轴（opencode/nemotron-3-ultra-free）（`.qm6/findings-backend.json`，3969 字节）

```json
{
  "axis": "后端/逻辑",
  "findings": [
    {
      "severity": "Info",
      "loc": "usePublishGroupApply.js:550-592",
      "symptom": "Q1: added+already+skipped 与去重后成员数的关系",
      "fix": "不存在违反输入。ids = [...new Set(rawIds.filter(id => typeof id === 'string' && id))] 后，循环中每个 id 必然且仅进入 added/already/skipped 三个互斥分支（均有 continue），三者长度之和恒等于 ids.length。"
    },
    {
      "severity": "Info",
      "loc": "usePublishGroupApply.js:585-591; usePlatformSelection.js:142-146,163-167",
      "symptom": "Q2: 平台已勾选但选中集为空时，是否会被回填默认账号",
      "fix": "不会。执行顺序：① 平台未勾选 → selectPlatform → selectAccount（同步段）；② 平台已勾选 → 直接 selectAccount（同步段）。同步段结束后 watch 触发 reconcileSelectedAccounts，此时该平台选中集已非空（含组内账号），不满足 selected.length===0 条件，不回填默认账号。证据：applyAccountGroup 无 await/nextTick（L585-591），reconcile 在 watch 回调中异步执行（L163-167）。"
    },
    {
      "severity": "Warning",
      "loc": "usePublishGroupApply.js:550-553; PRD.md §三 表格第5行",
      "symptom": "Q3: 非字符串 accountIds 被静默过滤，导致空组判定与 PRD 不一致",
      "fix": "代码用 ids.length（过滤后有效字符串数）判空组，PRD 用 accountIds.length（原始长度）。例：accountIds=[123,null] → PRD 视为 2 成员非空组，代码视为空组返回 empty-group。建议：代码改为先统计原始长度再过滤，或 PRD 补充“非字符串不计入成员”。按“文档为准”原则，属代码实现偏差。"
    },
    {
      "severity": "Info",
      "loc": "usePublishGroupTargets.js:71-79; usePlatformSelection.js:54-55,81-87; Publish.vue:865-877",
      "symptom": "Q4: selectedAccounts reactive proxy 传 IPC 风险",
      "fix": "本刀未引入新风险。本刀仅调用 selectAccount 写入器（内部修改 selectedAccounts.value[pid] 触发响应式），不读取 selectedAccounts.value 传给 IPC。IPC 序列化发生在既有发布流程（usePublishFlow/useBatchPublish），属存量风险。AGENTS.md 纪律要求上层在 IPC 前脱壳，本刀无新增传递路径。"
    },
    {
      "severity": "Info",
      "loc": "usePublishGroupTargets.js:123-129; usePublishGroupApply.js:606-609; PublishGroupPicker.vue:362; PublishTargetSelector.vue:458-462",
      "symptom": "Q5: groupsStatus=unreadable 时除 applyGroupById 外是否有其他改选中集入口",
      "fix": "无。unreadable 时 pickVisibleGroups 返回 [] → groupPickerItems 为空 → PublishGroupPicker 整块不渲染（v-if） → 无 chip 可点 → applyGroupById 找不到组直接返回。diff 内无其他入口修改选中集（既有 togglePlatform/toggleAccount 属手动操作，非本刀新增）。"
    },
    {
      "severity": "Info",
      "loc": "PRD.md §八 8 条 key; usePublishGroupTargets.js:92-119; PublishGroupPicker.vue:399,405",
      "symptom": "Q6: PRD §八 文案与代码产出路径对应性",
      "fix": "全覆盖。8 个 key 均有对应代码路径：label/applyAria 在组件渲染路径；added/platformsEnabled/skipped/alreadySelected/emptyGroup/nothingToAdd 在 announce() 分支中互斥且穷尽覆盖（added>0 / added=0&already>0 / added=0&already=0&skipped>0 / reason=empty-group）。无“文案无路径”或“路径无文案”。"
    }
  ],
  "checked": [
    {"q": 1, "verdict": "不存在违反输入"},
    {"q": 2, "verdict": "不会拿到额外账号，同步段顺序保证安全"},
    {"q": 3, "verdict": "不一致，代码以过滤后长度判空组，PRD 以原始长度，属代码偏差"},
    {"q": 4, "verdict": "本刀未引入新 IPC 风险"},
    {"q": 5, "verdict": "无其他入口"},
    {"q": 6, "verdict": "全覆盖，无遗漏"}
  ]
}
```

### 前端/集成轴（opencode/longcat-2.5-preview-free）（`.qm6/findings-frontend.json`，7522 字节）

```json
{
  "axis": "前端/集成（命名、模式、可维护性、跨层接线、可见性）",
  "findings": [
    {
      "severity": "Warning",
      "loc": "usePlatformSelection.js:75-87（selectPlatform/selectAccount）vs :63-70/:110-116（togglePlatform/toggleAccount）",
      "symptom": "同一响应式状态（selectedPlatforms/selectedAccounts）存在两个语义不同的写入入口：toggle 系列是切换语义，select 系列是只增语义。当前按组添加路径正确使用了 select 系列，但注释（:72-74）已承认『借用 togglePlatform 现在能过』的历史风险——一旦未来有人在按组添加路径误用 toggle 系列，会静默取消选择，且无任何编译期或运行期防护。",
      "fix": "收敛方向：保留两者（toggle 被既有 PublishTargetSelector 大量使用，不可删），但 (1) 将 select 系列改名为 ensurePlatformSelected/ensureAccountSelected，使『只增』语义在命名层面自解释；(2) 在 JSDoc 明确标注『按组添加专用，禁止在切换路径使用』；(3) 可选：在 toggle 系列加运行时警告（若检测到调用栈来自按组添加路径）。"
    },
    {
      "severity": "Warning",
      "loc": "usePublishGroupApply.js:622-634（countGroupApplicable）+ usePublishGroupTargets.js:73（resolveAccount）",
      "symptom": "applicable 依赖 resolveAccount（读 accountStore.accounts）和 isAccountAvailable（读 accountStore.byPlatform），而 total 只依赖 group.accountIds（来自 groups 真源）。若 accounts/byPlatform 异步填充，加载完成前 applicable=0 而 total 已正确，chip 显示 0/3；加载完成后跳变为 2/3。",
      "fix": "确认 accountStore.ensureLoaded() 是否在页面渲染前同步完成（diff 内不可见 accounts store 实现）。若为异步，需在 chip 上区分『未加载』与『真 0 可添加』两种状态（如加载前不渲染数字或显示占位符），避免 0/3→2/3 跳变误导用户以为组里凭空多了号。"
    },
    {
      "severity": "Info",
      "loc": "usePublishGroupApply.js:615-620（buildGroupPickerItems）",
      "symptom": "buildGroupPickerItems 返回 {id,name,total,applicable}，显式丢弃了 group.platformFilter 和 group.accountIds。这是展示层的合理裁剪，但意味着 PublishGroupPicker 组件无法在需要时访问原始组数据（如未来做组成员明细）。",
      "fix": "当前无需修改。若未来需要原始数据，可在 items 里附加 _raw 字段或让组件直接接收 groups + deps。"
    },
    {
      "severity": "Info",
      "loc": "PublishGroupPicker.vue:377,382（data-testid=`group-apply-${item.id}`）",
      "symptom": "动态 testid 使用 uuid（item.id），与仓库既有静态 kebab-case 命名纪律（publish-target-selector、publish-action-controls、publish-group-picker）不一致。当前测试用固定 id（g1,g2）所以稳定，但未来若有 e2e 或其他测试依赖完整 testid 字符串，会因 uuid 每次运行变化而脆弱。",
      "fix": "若 testid 仅用于组件内测试，可保持现状（测试数据用固定 id）。若可能被外部依赖，建议改为 group-apply-${index} 或 group-apply-${slugify(name)}，或在测试里用 [data-testid^=\"group-apply-\"] 前缀选择器。"
    },
    {
      "severity": "Info",
      "loc": "usePublishGroupTargets.js:69（const t = (key, named) => i18n.global.t(key, named || {})）",
      "symptom": "组名可含 { } @ 等字符（用户自由输入，最长 40）。vue-i18n 的 t(key,{name}) 默认不递归解析插值——模板里的 {name} 被替换为组名值后，值里的 {name} 不会被二次解析。因此组名含 { } 不会报错或产出错文案。但 @ 在 vue-i18n 里是链接语法（@:key），若组名以 @ 开头且恰好匹配链接模式，可能被解析。",
      "fix": "需要测试证明安全：(1) 组名='test{name}'，断言 t('publishPage.groupPicker.applyAria',{name:'test{name}'}) 输出含 'test{name}' 原样；(2) 组名='@:some.key'，断言不被解析为链接；(3) 组名='100% {name}'，断言不报错。若测试失败，需对组名做转义或改用 list 语法。"
    },
    {
      "severity": "Info",
      "loc": "PublishGroupPicker.vue:362（v-if=\"items.length > 0\"）",
      "symptom": "无组不渲染牺牲了可发现性：从未建过组的用户在发布页看不到任何『按组添加』入口，无法感知此功能存在。PRD §六 已将其视为视觉中性的必要代价。",
      "fix": "在『不改 DOM』约束下，不存在既不改 DOM 又能让建过组的用户看到入口的方案（看到=渲染=改 DOM）。可能的折中：(1) 修改已有节点文本（如 PublishTargetSelector 的 label 或搜索框 placeholder）加『可按组添加』提示，不新增 DOM 节点；(2) 在账号页 AccountGroupsPanel 加『去发布页使用』引导（跨页面方案）。但方案 (1) 可能触发像素门禁，需评估阈值。"
    }
  ],
  "checked": [
    {
      "q": 1,
      "verdict": "存在口径分裂风险。收敛到 select 系列（只增语义），因为按组添加场景下 toggle 语义危险（会取消选择），且 select 符合 additive 语义。但 toggle 被既有代码大量使用不可删，应保留两者并加强隔离（改名 ensure*、JSDoc 标注、可选运行时警告）。"
    },
    {
      "q": 2,
      "verdict": "加载完成前 applicable=0（resolveAccount 返回 null），total=3（不依赖 accounts），chip 显示 0/3；加载完成后跳变为 2/3。跳变确实存在且有误导性（用户可能以为组里凭空多了号）。但 PRD §七 称 ensureLoaded 已在挂载时完成，若同步则无跳变窗口。需确认 accounts store 的加载时序（diff 内不可见）。"
    },
    {
      "q": 3,
      "verdict": "applicable/total 没有丢。逐层证据：(1) usePublishGroupApply.js:615-620 buildGroupPickerItems 显式返回 {id,name,total,applicable}；(2) Publish.vue:848 传 groupPickerItems（已含 applicable/total）；(3) PublishTargetSelector.vue:459 直接透传 :items=\"accountGroups\"，无白名单；(4) PublishGroupPicker.vue:370-383 使用 item.applicable/item.total。丢的是 platformFilter 和 accountIds，但展示层不需要。"
    },
    {
      "q": 4,
      "verdict": "在『不改 DOM』约束下无完美替代方案。看到入口必然意味着渲染新元素。折中方案：(1) 修改已有节点文本（如 PublishTargetSelector label 或搜索框 placeholder）加提示，不新增 DOM 节点，但可能触发像素门禁；(2) 在账号页加跨页面引导。PRD §六 的取舍（视觉中性优先于可发现性）是合理的，但应记录为已知产品权衡。"
    },
    {
      "q": 5,
      "verdict": "vue-i18n 默认不递归解析插值，组名含 { } 不会报错或产出错文案（模板里的 {name} 被替换为组名值后，值里的 {name} 不会被二次解析）。但 @ 是链接语法，若组名以 @ 开头且匹配链接模式可能被解析。需要测试证明安全：组名='test{name}'、'@:some.key'、'100% {name}' 三种 case 断言输出原样。"
    },
    {
      "q": 6,
      "verdict": "动态 testid 用 uuid 与仓库既有静态 kebab-case 命名纪律不一致。当前测试用固定 id（g1,g2）所以稳定，但未来若有 e2e 依赖完整 testid 会脆弱。建议改为 group-apply-${index} 或在前缀选择器 [data-testid^=\"group-apply-\"] 上依赖。"
    }
  ]
}
```
