# PRD：视频发布页「视频文件选择反馈」深度优化

- 文档编号：PRD-VIDEO-SELECT-FEEDBACK-2026-09-28
- 日期：2026-09-28
- 状态：已实现（分支 `video-select-feedback`）
- 范围：`apps/desktop/src/views/Publish.vue`（视频发布模式 + 图文模式含视频平台分支）、`SelectedVideoCard.vue`（新组件）、`video-selection-feedback.js`（新纯逻辑模块）、`locales/zh.js` + `locales/en.js`（成对文案）

---

## 1. 背景与问题

### 1.1 用户反馈（一手证据）

首次使用视频发布页的用户反馈：点击「视频文件」上传区选择本地视频文件、文件对话框返回页面后，**界面反馈太不明显**——用户完全没有注意到任何变化，误以为「点了没反应」，准备再次重试。

### 1.2 现状（修复前）反馈链盘点

| 反馈通道 | 修复前行为 | 问题 |
|---|---|---|
| Toast 通知 | `ElMessage.success('已选择视频文件')`，3 秒后消失，固定显示在**视口顶部居中** | ①位置远离用户视线焦点（上传区在表单中部）；②文案无文件名，无法确认「选对了」；③3 秒后消失，回神时已无证据 |
| 上传区（dropzone） | 选择前后**零视觉差异** | 用户视线最后停留在上传区，这里恰恰是唯一没有变化的地方 |
| 文件列表 chip | el-upload 默认 file-list 显示一行小字灰色文件名（如 `01.mp4`） | 视觉权重极低（默认 12px 灰字），首次使用者不会注意到 |
| 元信息确认 | 无 | 没有大小/格式等「选对了」的客观证据 |
| 再次选择 | 与首次完全相同的 toast | 无法确认「替换已生效」还是「还在用旧文件」 |
| 超限校验 | 无（UI 提示写了「最大 500MB」但代码从未校验） | 用户选了超大文件当时无感知，直到发布才失败 |

### 1.3 根因

反馈设计只覆盖了「瞬时通知」一个维度，且通知位置（视口顶部）与操作位置（上传区）分离；缺少**常驻成功态**与**元信息确认**两个关键反馈维度。

---

## 2. 目标

1. **可感知**：选择成功后，在用户视线焦点处（上传区正下方）出现不可错过的常驻成功反馈。
2. **可确认**：反馈中携带文件名、大小、格式三项元信息，用户能核对「选的就是我要的那个文件」。
3. **可操作**：反馈区自带「更换视频」「移除」两个动作，修正路径明确。
4. **可区分**：首次选择 / 替换 / 同文件重选 / 超限拒绝，四种场景文案与级别差异化（见 §5 分析结论）。
5. **可校验**：500MB 上限在选择时立即拦截反馈，不再延迟到发布阶段。

---

## 3. 状态枚举（Page-Level TDD Phase 1）

| # | 场景 | 触发路径 | 反馈形态 | 数据变化 |
|---|---|---|---|---|
| S1 | 首次选择成功 | 点击/拖拽选文件，`video_path` 为空 → 有值 | Toast success（带文件名）+ 常驻卡片出现 + 上传区绿框 | `video_path` 登记、`videoFileMeta` 填充 |
| S2 | 替换为不同文件 | 已选状态下重选另一文件（on-exceed → clearFiles + handleStart） | Toast success（新名 + 原文件名）+ 卡片内容更新 | 同上（覆盖） |
| S3 | 重选同一文件 | 已选状态下再次选择同一路径文件 | Toast info「当前已是该视频」（不再报成功，避免误导） | 状态不变（幂等） |
| S4 | 选择超限文件 | 文件 size > 500MB | Toast warning（带实际大小），**选前拦截** | 不覆盖旧选择，旧卡片保留 |
| S5 | 路径解析失败 | `getPathForFile` 返回空 | Toast warning（沿用 media_path_unresolved） | `video_path` 清空 |
| S6 | 移除（el-upload 列表 ✕） | 点 file-list 删除 | 卡片消失、上传区恢复虚线框 | `video_path`/`videoFileMeta` 清空 |
| S7 | 移除（卡片按钮） | 点卡片「移除」 | 同 S6，且同步 clearFiles 清空 el-upload 内部列表 | 同 S6 |
| S8 | 更换（卡片按钮） | 点卡片「更换视频」 | 触发隐藏 input 打开文件对话框，之后走 S2/S3/S4 | — |
| S9 | 草稿/query 恢复 | URL 带 `video_path` 进入 | 卡片以「路径推导文件名 + 大小未知」降级渲染（无 File 元信息） | `videoFileMeta = null` |

---

## 4. 功能逻辑与交互逻辑

### 4.1 纯逻辑模块 `src/utils/video-selection-feedback.js`

单一来源，纯函数、无 Vue/i18n 依赖：

| 导出 | 说明 |
|---|---|
| `VIDEO_MAX_BYTES` | 500MB 上限常量（500 × 1024 × 1024），与 UI 提示口径对齐 |
| `isVideoOversize(sizeBytes)` | 超限判定；非法值（NaN/undefined/负数）不视为超限，交给路径解析兜底 |
| `describeVideoFile(file)` | 提取展示元信息 `{name, sizeBytes, formatLabel}`；name 缺失时从 path 推导 basename；格式取 `type`（video/mp4 → MP4），缺失时取扩展名 |
| `classifyVideoSelection({prevPath, nextPath, sizeBytes})` | 判定反馈形态：`'oversize'`（超限，最高优先级）→ `'unresolved'`（无路径）→ `'first'`（无旧路径）→ `'replaced'`（路径不同）→ `'reselected'`（路径相同） |

### 4.2 组件 `src/features/publish/components/SelectedVideoCard.vue`

常驻成功态卡片，`path` 非空才渲染（`:key="path"`，替换时重播入场动画）：

- **显示项**：✅ 图标 + 「已选择视频文件」标题（绿色 600 字重）、文件名（加粗、`word-break: break-all` 防长名溢出）、大小（`formatBytes` 格式化 / 「大小未知」）、格式徽标（绿底白字大写）、操作提示行、「更换视频」「移除」按钮。
- **事件**：`replace`（父组件触发隐藏 file input）、`remove`（父组件 clearFiles + 清状态）。
- **视觉**：成功绿 1.5px 边框 + 4px 左强调边 + 浅绿底 + 0.25s 淡入位移动画。
- **两处复用**：视频发布模式（Publish.vue video 分支）与图文模式 `hasVideoPlatforms` 分支共用同一组件、同一处理链，天然一致。

### 4.3 Publish.vue 处理链改动

- `handleVideoFileChange`：先 `classifyVideoSelection` 判定形态 → oversize 拦截（warning，不动旧状态）→ 路径空走 unresolved（清状态）→ 成功登记后按 first/replaced/reselected 分别发 success/success/info toast（均带文件名；replaced 附原文件名）。
- `videoFileMeta`（ref）：记录 `describeVideoFile` 输出，卡片展示用；移除/解析失败时清空。
- `videoUploadFileList`（ref）：绑定 `v-model:file-list`，保证选择后 el-upload file-list 同步显示（此前靠 el-upload 内部状态）。
- `handleVideoCardRemove`：`clearFiles()` + 清 `video_path`/`videoFileMeta`。
- `triggerVideoReselect`：经 `videoUploadRef.$el.querySelector('input[type="file"]').click()` 打开文件对话框；失败静默（降级为用户手动点击上传区）。
- 上传区成功态样式：`has-selected-video` class → dropzone 绿实线边框 + 浅绿底 + 图标转绿。

### 4.4 提示文字（zh / en 成对，`publishPage.*`）

| key | zh | en | 级别 |
|---|---|---|---|
| `videoSelectedNamed` | ✅ 已选择视频：{name} | ✅ Video selected: {name} | success |
| `videoReplaced` | 🔁 已替换为新视频：{name}（原：{previous}） | 🔁 Replaced with: {name} (was: {previous}) | success |
| `videoReselectSame` | ℹ️ 当前已是该视频：{name} | ℹ️ Already selected: {name} | info |
| `videoTooLarge` | ⚠️ 视频超过 500MB 上限（当前 {size}），请压缩后重新选择 | ⚠️ Video exceeds the 500MB limit (current {size}); please compress it and select again | warning |
| `videoCard.replace` | 更换视频 | Change video | — |
| `videoCard.remove` | 移除 | Remove | — |
| `videoCard.sizeUnknown` | 大小未知 | Size unknown | — |
| `videoCard.hint` | 如需更换，可重新拖拽文件到上方区域，或点击「更换视频」 | To change, drag a new file onto the zone above, or click "Change video" | — |

文案全部经 `notifyCore.notifyText` 解析（message function 插值），并继承 i18n 防泄漏守卫与 notify:log 上报。

---

## 5. 「再次选择是否需要差异化提示」分析结论

**结论：需要，且按三种子场景差异化。**

| 子场景 | 用户意图 | 差异化设计 | 理由 |
|---|---|---|---|
| 换成不同文件 | 「刚才选错了/想换」 | success 级，文案明确「已替换为新视频 X（原：Y）」 | 用户最需要确认的是「旧文件真的被换掉了」，双名对照直接回答；保持 success 级因为这是一次有效变更 |
| 重选同一文件 | 误操作 / 没注意到已选上想再选一次 | 降级为 info 级「当前已是该视频 X」 | 状态零变化却报「成功」会制造虚假变更感；info 级如实告知「无需再选」，同时是低成本的教育（用户由此发现卡片反馈） |
| 超限文件 | 「选了个大文件」 | warning 级 + 实际大小，**拦截不覆盖** | 若静默替换或延迟到发布才报错，用户会在错误状态下继续填半天表单；选前拦截 + 保留旧选择是最小惊讶原则 |

不采用「每次重选都弹确认框」方案：打断心流、且 limit=1 替换语义本身符合用户预期（el-upload 已按此设计 on-exceed 链）。

---

## 6. 数据校验规则

| 规则 | 时机 | 行为 |
|---|---|---|
| 大小 ≤ 500MB | 选择时（`handleVideoFileChange` 入口） | 超限 → warning toast（带 `formatBytes` 实际大小），不覆盖旧选择；非法 size（NaN/负数/缺失）不拦截，交路径解析兜底 |
| 路径可解析 | 选择时 | `raw.path` → `getPathForFile` 链解析为空 → warning（media_path_unresolved），清空选择 |
| 同路径幂等 | 选择时 | 新旧 `video_path` 相同 → info 提示，状态不变 |
| 状态同步 | 移除/替换 | `video_path` 与 `videoFileMeta` 必须同时变更；卡片 `v-if="path"` 与上传区 class 均以 `video_path` 为唯一真源 |

## 7. 验收标准（已全部自动化覆盖）

- AC1：首次选择 → success toast 含文件名 + 卡片出现（文件名/大小/格式）+ 上传区绿框 ✅（Publish.test.js / SelectedVideoCard.test.js）
- AC2：替换不同文件 → toast 同时含新旧文件名，卡片内容更新 ✅
- AC3：重选同文件 → info toast，success 不触发，状态不变 ✅
- AC4：600MB 文件 → warning toast 含「500MB」，旧选择保留 ✅
- AC5：卡片移除 → clearFiles 调用 + video_path/videoFileMeta 清空 ✅
- AC6：视频模式选择后 DOM 中存在 `video-selected-card` 且含文件名与格式化大小 ✅
- AC7：query 恢复 `video_path`（无 File 元信息）→ 卡片降级渲染 basename ✅
- AC8：`triggerVideoReselect` 点击隐藏 file input ✅
- AC9：纯逻辑边界（500MB 临界、name 缺失、格式兜底、unresolved）✅（video-selection-feedback.test.js 14 例）

测试矩阵：14（纯逻辑）+ 5（卡片组件）+ 69（视图集成，含 9 新增）= 88 例全绿。

## 8. 非功能与约束

- **i18n**：zh/en 成对提交（CI Gate 7）；渲染端不新增中文字符串字面量（全部走 locales）。
- **复用**：大小格式化复用 `utils/bytes.js`（与日志/缓存统计同口径）；判定逻辑独立模块便于后续扩展（如时长/分辨率元信息）。
- **性能**：零额外 IPC/网络；卡片为纯渲染组件。
- **兼容性**：不改变 `video_path` 契约与发布链路；草稿/query 恢复路径行为不变（仅新增降级展示）。
- **范围外**（标记 Ocean）：视频时长/分辨率探测（需主进程 ffprobe，另行立项）、缩略图预览（同）、拖拽中 hover 强化（el-upload 原生行为已可用）。

## 9. 关联

- 实现分支：`video-select-feedback`
- 历史关联：「on-exceed 静默丢文件」修复（Publish.vue handleVideoFileExceed 注释）——本次在其上补全反馈维度。
