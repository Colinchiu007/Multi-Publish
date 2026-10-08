# PRD：发布记录筛选扫描节流 + S2V 选项自动保存防回归（M-11 / M-12）

- 文档类型：修复型 PRD（含数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字）
- 日期：2026-10-07
- 来源：前端深度审查报告 `docs/frontend-deep-review-2026-10-05.md` M-11 / M-12
- 分支：`batch-b-debounce-watch`
- 编号约定：本文 M-11 / M-12 均为**报告正文编号**

---

## 1. 背景与问题

### 1.1 M-11：发布记录筛选每敲一个字符就翻完整个历史表

用户在「发布记录」页筛选（搜索词 / 发布者 / 内容类型 / 状态 / 发布方式 / 平台 / 日期，
共 7 个筛选源）时，组件有两个叠加的放大效应：

1. **7 个筛选源全是裸 `watch`** —— 任何一个变化立即触发一次加载；用户连续改三个条件
   就是三轮。
2. **补页是无上限的 `while` 循环** —— 原实现 `while (hasActiveFilters && hasMoreRecords)`
   每页 50 条串行拉取，直到把整张历史表拉完或用户清空筛选。

叠加后果：历史表积累到数千条后，用户在搜索框里敲 5 个字符 = **5 轮 × 数十次串行 IPC 往返**。
界面只显示一句「正在检索全部发布记录」，用户感知为"输入卡顿 + 风扇转"，且无法中途取消。

### 1.2 M-12：CreateView 双深 watch

`CreateView.vue` 对 `s2vConfig` / `s2vOutputConfig` 用了两条 `deep: true` watch。
这是 5600 行组件的巨型依赖链：每次嵌套字段写入（用户拖滑块、逐字输入）都要对整棵
配置树做完整深度遍历 + 依赖收集 + 触发重算，而业务上只关心"值变了没变"。

### 1.3 M-12 修复过程中暴露的更严重问题（本次记录的重点）

修 M-12 时，我一度把快照方法体**直接写进 `watch: {}` 块**。在 Options API 里，
watch 块中的方法名就是被监听的属性名，而那个名字既不是 data 也不是 computed ⇒
该 watch **永不触发** ⇒ 「选项变更 1s 防抖自动保存」被静默删除。

而 `CreateView.test.js` 的 **288 条用例全绿**。原因：既有测试只覆盖"恢复上次选项"
（restore），**从未覆盖"变更后自动保存"（autosave）**。测试全绿在这里不代表没问题，
而是代表没人看着。

> 这条已写入报告 §C.8「缺陷复现型测试的系统性风险」，本次用两条机械锁把它固化。

---

## 2. 目标与非目标

### 2.1 目标

| 编号 | 目标                                                    |
| ---- | ------------------------------------------------------- |
| G1   | 连续修改多个筛选条件只触发一轮补页扫描                  |
| G2   | 补页页数有上限，最坏情况从「不限」降到 20 次串行 IPC    |
| G3   | 扫描未覆盖全表时，界面**如实**说明，不谎称"已从全部中筛选" |
| G4   | 视图层具备可复用的防抖工具（根因是缺工具，不是缺调用）  |
| G5   | S2V 选项自动保存有**运行时实测**守护，功能性死亡能被机械发现 |
| G6   | Options API 的 watch 键拼写错误能被静态拦截             |

### 2.2 非目标

- **不改动筛选结果的计算逻辑**（哪些记录命中）：本次只改"什么时候扫、扫多少"。
- **不引入虚拟滚动**：报告 M-15 明确不建议在此阶段上；本次只节流扫描，不改渲染方式。
- **不修改 `invoke` 的默认超时**：那属于 M-13 的范围，本批次不动。
- **不拆分 `CreateView.vue`**：那是 M-8，工作量最大，单列批次 D。

---

## 3. 功能逻辑

### 3.1 M-11：筛选扫描节流与封顶

**数据校验 / 输入**

| 项                 | 规则                                                         |
| ------------------ | ------------------------------------------------------------ |
| 筛选源             | 7 个：`searchQuery`、`publisherFilter`、`contentTypeFilter`、`statusFilter`、`publishModeFilter`、`platformFilter`、`dateFilter` |
| 防抖延迟           | 300 ms（与仓库既有唯一手写防抖 `Accounts.vue` 一致，不引入第二个数字） |
| 每页条数 `PAGE_SIZE` | 50（沿用既有值，不变）                                      |
| 扫描页数上限 `FILTER_SCAN_MAX_PAGES` | **20**（= 约 1000 条）                            |

**流程**

1. 用户改动任一筛选源 → `immediate` 值立刻更新（输入框回显不延迟）。
2. `useDebouncedWatchSources` 把 7 个源合成一个快照 ref，300 ms 内连续变更**只产生一次**快照更新。
3. 快照变化 → 触发 `loadRemainingRecordsForFilters()`。
4. 该函数以 `for (let page = 0; page < FILTER_SCAN_MAX_PAGES; page++)` 串行补页，
   每轮前先检查 `hasActiveFilters && hasMoreRecords`，不满足即 break。
5. 循环结束后若仍有更多记录 ⇒ `filterScanTruncated = true`。

**为什么是 20 页（= 1000 条）**

- 覆盖量：按每页 50 条计，1000 条已包含绝大多数真实使用下的命中范围；
- 往返次数：把最坏情况从「不限」压到 20 次串行 IPC；
- 若不给上限，历史表每增长一倍，单次搜索的代价就翻倍——这是**随时间恶化的缺陷**。

**为什么不是"先做个 loading 让用户能取消"**

取消只能止损，不能防止这次已经发出的上百次 IPC；且用户在筛选框里的真实意图是
"快点看到匹配项"，不是"我要全表扫描"。封顶 + 如实提示比可取消更符合意图。

### 3.1.1 清空筛选必须让扫描停下

`loadRemainingRecordsForFilters` 的循环**每一轮开头**都重新检查
`hasActiveFilters && hasMoreRecords`：

```js
for (let page = 0; page < FILTER_SCAN_MAX_PAGES; page++) {
  if (!hasActiveFilters.value || !hasMoreRecords.value) break
  const loaded = await loadRecords({ append: true })
  if (!loaded) break
}
```

用户在扫描途中清空搜索框 ⇒ 下一轮立即 break，不再继续翻表；同时
`filterScanTruncated` 复位为 false（筛选都没了，不该再显示截断提示）。

为什么检查放在**循环开头**而不是只在入口：扫描是串行的、可持续数十秒，
入口检查只能挡住"开始前的那一刻"。放在开头才能挡住"中途取消"。
回归用例：`publish-history-filter-scan.test.js` 的「清空筛选后不再继续补页」。

### 3.2 M-11：触顶的如实提示（显示项）

触顶时组件不得再声称"已从 N 条中筛选"——那暗示扫完了全表，用户会把"没搜到"
误判为"这条记录不存在"。

| 状态      | 显示节点              | 文案（zh）                                     | 文案（en）                                       |
| --------- | --------------------- | ---------------------------------------------- | ------------------------------------------------ |
| 未触顶    | `.filter-result`      | 已从 {count} 条记录中筛选                      | Filtered from {count} tasks                      |
| **触顶**  | `.filter-result`      | **已在已加载的 {count} 条任务中筛选**          | **Filtered from {count} loaded tasks**           |
| **触顶**  | `.filter-truncated`（role=status） | 匹配范围较大，已停止继续翻页；请补充更具体的筛选条件。 | Match range is large; stopped paging further. Please narrow the filters. |

- 触顶提示节点只在 `hasActiveFilters && filterScanTruncated` 时出现，未触顶时不存在。
- `filteredFromLoaded` 用的是**已加载条数** `records.length`，不是 `total` ——
  这正是"如实"的含义：告诉用户实际扫了多少，而不是库里有多少。

**交互逻辑**

- 输入框仍绑定原始 `searchQuery`（`immediate`），打字不顿；只有昂贵的加载走防抖值。
- 清空全部筛选（`hasActiveFilters === false`）：不触发补页，`filterScanTruncated` 复位为 false。

### 3.3 M-12：S2V 选项快照 watch

**改动**：原 `s2vConfig` / `s2vOutputConfig` 两条 `deep: true` watch，
改为监听一个 computed 快照 `s2vOptionsSnapshot`：

```js
computed: {
  s2vOptionsSnapshot () {
    return JSON.stringify({
      config: this.s2vConfig ?? null,
      output: this.s2vOutputConfig ?? null,
    })
  },
},
watch: {
  s2vOptionsSnapshot () {
    if (this.s2vConfigProfileApplying) return
    this.s2vActiveConfigProfile = ''
    this.scheduleS2VLastOptionsSave()
  },
},
```

**为什么用序列化而不是逐字段叶子 getter**

S2V 配置的字段集会随配置档扩展（历史上多次新增/移除参数）。逐字段列举会**漏**，
漏掉的字段此后永久失去响应——而且是静默的。序列化天然覆盖全字段。
前提：S2V 配置是纯数据（选项值 / 样式值），可 JSON 序列化。

**开销对比**

| 方案                | 单次嵌套写入的开销                     |
| ------------------- | -------------------------------------- |
| 两条 `deep: true`   | O(深度遍历 + 依赖收集 + 整链重算)      |
| 快照浅比较          | O(对象大小) 的序列化 + 一次字符串比较  |

**语义不变的保证**：深层字段（如 `subtitleStyle.color`）改变也会改变快照字符串 ⇒
watch 仍然触发。这点由运行时测试钉死（见 §5）。

**不触发的条件**：`s2vConfigProfileApplying === true`（正在套用配置档）时直接返回，
避免把当前档名 `s2vActiveConfigProfile` 清成空串。

---

## 4. 新增/修改的文件

| 文件                                                     | 类型 | 说明                                            |
| -------------------------------------------------------- | ---- | ----------------------------------------------- |
| `apps/desktop/src/composables/useDebouncedRef.js`        | 新增 | `useDebouncedRef` + `useDebouncedWatchSources`  |
| `apps/desktop/src/views/PublishHistory.vue`              | 修改 | 防抖快照 watch + 页数上限 + 触顶如实提示        |
| `apps/desktop/src/views/CreateView.vue`                  | 修改 | `s2vOptionsSnapshot` computed + 快照 watch      |
| `apps/desktop/src/locales/zh.js`                         | 修改 | 新增 2 条文案                                   |
| `apps/desktop/src/locales/en.js`                         | 修改 | 新增 2 条文案（zh/en 成对，CI Gate 7 强制）      |
| `apps/desktop/src/views/publish-history-filter-scan.test.js` | 新增 | M-11 回归 4 用例                            |
| `apps/desktop/src/views/s2v-options-autosave.test.js`    | 新增 | M-12 运行时实测 4 用例                          |
| `apps/desktop/src/views/options-api-watch-sources.test.js` | 新增 | M-12 静态守卫 9 用例                          |
| `apps/desktop/src/views/PublishHistory.test.js`          | 修改 | 适配防抖（显式等待，不改断言语义）              |

### 4.1 `useDebouncedRef` 设计取舍

- **返回 ref 而不是回调**：调用点需要的是"一个会延迟生效的值"，watch 起来最自然；
  给回调会逼每个调用方自己管计时器，又退回到各自手写的状态。
- **默认 300 ms**：与仓库唯一那处手写防抖保持一致。
- **`immediate` 与 `debounced` 分开**：输入框要立刻回显（否则打字会顿），
  但触发昂贵操作的是延迟值。
- **卸载自动清理**：`onUnmounted` 里清计时器，否则对已卸载组件触发（与 M-16 同类）。

---

## 5. 验证与反证（证据纪律 §C.8）

### 5.1 测试结果

| 测试文件                                  | 用例数 | 结果 |
| ----------------------------------------- | ------ | ---- |
| `publish-history-filter-scan.test.js`     | 6      | 全绿 |
| `s2v-options-autosave.test.js`            | 4      | 全绿 |
| `options-api-watch-sources.test.js`       | 9      | 全绿 |
| `PublishHistory.test.js`（既有）          | 70     | 全绿 |
| `CreateView.test.js`（既有）              | 288    | 全绿 |

### 5.2 反证（撤掉修复 ⇒ 断言必须转红）

| 反证操作                                                    | 预期转红                    | 实测 |
| ----------------------------------------------------------- | --------------------------- | ---- |
| CreateView watch 键改为不存在的名字（复现事故形态）          | 静态 1 条 + 运行时 2 条转红 | ✅ 3 条转红 |
| PublishHistory 页数上限 `20` → `99999`（退回无上限）         | 页数封顶断言转红            | ✅ 用例超时（扫描真的无限翻页） |
| 防抖延迟 `300` → `0`（退回裸 watch）                         | 防抖窗口内不补页断言转红    | ✅ 1 条转红（12 次调用 vs 预期 1 次） |

**反证过程中的两次自我修正**（按 §C.8「反证不通过先怀疑自己的实证」）：

1. 首版防抖断言只 `await nextTick()` 就检查"是否已发起补页"。撤掉防抖后**没转红** ——
   因为 `nextTick` 只是微任务，连 0ms 定时器都还没轮到，"延迟生效"与"立刻生效"
   表现相同。改为**推进 100ms 真实时间**（小于 300ms 防抖窗口）后才能区分。
2. 首版页数上限用例用假定时器驱动 20 轮串行 `await`，拖到 60s 超时；改真实定时器
   后又因每页返回相同 id 被去重保护提前终止。两处都是**夹具错了**，不是代码错了。

### 5.3 反证过程中的两个真实发现

1. **假定时器驱动不了 20 轮串行 await**：首版测试用 `vi.useFakeTimers()` +
   60 轮 `advanceTimersByTimeAsync` + `flushPromises`，直接把用例拖到 60s 超时。
   改为真实定时器（这些 IPC mock 是立即 resolve 的），扫描几十毫秒结束。
2. **每页 id 必须各不相同**：首版 mock 每页返回相同 id，组件按 id 去重 ⇒
   `addedCount === 0` ⇒ 判定已到底而提前退出 —— 那是**去重保护在正常工作**，
   测不到"页数上限"这条路径。改为每页 id 递增后才真正触发封顶。
   （这条也说明：写"缺陷复现型"测试时，夹具必须让缺陷路径真的被走到。）

### 5.4 静态守卫的两版踩坑（已写入测试注释）

1. 定位块不能靠 `^  watch` 固定缩进正则 —— 实测各文件缩进不一致，首版解析出 0 个块，
   守卫全空转。改用 `@vue/compiler-sfc` + 大括号配平。
2. **取键名不能只认 `data: {`** —— 本仓 6 个 Options API 视图**全部**写成
   `data() { return {...} }`，首版正则只认 `data: {`，于是 data 键一个都没拿到，
   CreateView 的合法 watch 被误报成孤儿。现改为支持 `data()` 并在求值失败时
   回退到文本层键名扫描。

> 这两个坑的共同形态：**守卫自己错了，且错的方向是"静默失效"或"假阳性"**。
> 因此本文件专门加了「分析器有效性」断言：data 键为空 ⇒ 直接红，
> 防止下面的每条断言在空集上空转。

---

## 6. 风险与残留

- **1000 条上限是人工取值**，不是从数据推导。若后续真实历史表普遍超过 1000 条，
  需要配合 M-15 的分页一起改（让筛选走服务端过滤，而不是客户端全表扫描）。
  当前阶段先把"随时间恶化"压成"固定上限"。
- **`s2vOptionsSnapshot` 依赖 JSON 序列化**：若将来 S2V 配置里放入不可序列化的值
  （函数、循环引用），快照会退化为 `{}` 或抛错。当前配置是纯数据，风险可控；
  已在 computed 注释里写明前提。
- **静态守卫对组合式 `<script setup>` 不适用**（如 PublishHistory.vue）——
  它们用 `watch()` 显式传 getter，不存在"键名拼错就静默失效"的形态。
  首版把 PublishHistory.vue 也写进覆盖范围断言，红得没有意义，已修正。
- **M-8（CreateView 245 methods 拆分）未做**：CreateView.vue 仍是 5600 行巨型文件，
  巨型文件门禁仍然紧绷。

---

## 7. 后续

- 批次 C：M-9（9 份 `getApi` 收敛 + 6 处绕过桥接层）。
- 批次 D：M-15（分页）+ M-8（CreateView 拆分）。
- M-15 落地后，筛选应改为服务端过滤，届时可移除 `FILTER_SCAN_MAX_PAGES` 这个临时上限。
