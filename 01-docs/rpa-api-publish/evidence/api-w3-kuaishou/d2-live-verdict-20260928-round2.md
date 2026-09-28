# D2 快手发布按钮 — 2026-09-28 二轮取证修正（定案）

> 本文修正同日早前的 `d2-live-verdict-20260928.md` 一轮结论：一轮把「发布时间」单选项
> `<span>立即发布</span>` 误判为提交钮（PR #2554 据此修复后，活体复测仍 responses=0）。
> 二轮取证定案真提交钮为**底栏 `<div>发布</div>`**。

## 二轮取证方法（零发布副作用）

1. **发布流实测**（16:54，用户真实点击发布）：一轮修复部署后重跑，点击命中
   `<span>立即发布</span>`（8ms 即返回）→ 页面停在表单、`responses=0` → 验证快照文本
   揭示「发布时间 立即发布 定时发布 …… 一键设置 **发布** 取消 预览封面 预览作品」——
   立即发布是发布时间区的单选项；底栏另有「发布」「取消」。
2. **账号标签注入探测**（17:20，`probe-ks-submit-btn.js` + `probe-ks-inject-video.js`）：
   经 `pageManager.createNewTabPage({url, platform, accountId})` 打开注入凭证的快手发布页
   标签（persist:account-56f39f5f 分区），CDP `DOM.setFileInputFiles` 注入视频触发编辑态
   渲染，DOM 域全标签叶子文本搜索。

## 决定性证据（编辑态页面，注入探测实测）

| 元素 | 完整 HTML | 判定 |
|---|---|---|
| `<div>` 发布 | `<div>发布</div>` | **真提交钮**——裸 div，**全页唯一直接文本为「发布」的元素**（结构探针 `probe-ks-submit-structure.js` 实测 count=1），兄弟 `<div>取消</div>` |
| `<div>` 取消 | `<div>取消</div>` | 底栏取消动作 |
| `<span>` 立即发布 | `<span>立即发布</span>` | **发布时间单选项**（一轮误判对象；点击只切换定时模式，不触发发布 API） |
| `<span>` 定时发布 | `<span>定时发布<img …>` | 定时发布单选项 |
| `<span>` 一键设置 | `<span class="_button_vf55z_42">一键设置</span>` | 粉丝活跃时间一键设置 |
| `<span>` 预览封面/预览作品 | `<span class="_tab_1eni7_101">…` | 预览 tab |

## 一轮误判的根因

一轮取证（snapshot-005）只采了 `button/[role=button]/a` 与含「发布」文案的 span——底栏
提交钮是裸 `<div>`，两个采集面都漏掉；「立即发布」span 因文本最像提交钮被误判。二轮的
全标签叶子文本搜索（任意标签）才暴露 `<div>发布</div>`。**教训：提交钮取证的采集面
必须覆盖全部标签，不能预设按钮的标签形态。**

## 修复（二轮，随本 PR）

`platform-selectors.js` kuaishou `publish_btn`：
- 首位改为 `div:has-text("发布")`——解析器 exactLeaf 层唯一命中 `<div>发布</div>`
  （全页唯一直接文本为「发布」的元素，零歧义）
- **移除 `span:has-text("立即发布")`**（单选项诱饵；一轮修复引入，点击点错对象）
- 旧候选保留在后兜底

回归锁：`platform-selectors.test.js`（首位断言 + **诱饵候选不得在列**断言）+
`rpa-selector-utils.test.js` 活体 fixture 5 例（div exactLeaf 唯一命中 / 单选项诱饵演示 /
旧候选歧义演示 / 登录页负例 / 空表单负例）+ `rpa-view-platforms.test.js` 数据契约锁同步。

## 残余

- 活体发布验收（3.5 / api-publish-engine-w3 6.3）待本修复合并后重跑。
- 验证快照中的「命运石 确定」模态（disabled el-button）与「近7天的下载记录」弹窗：若
  底栏点击被其遮挡，需在发布前增加模态关闭步骤——待活体验证观察。
- API 轨 `taskData.video.path required` 为独立缺陷，另行登记。
