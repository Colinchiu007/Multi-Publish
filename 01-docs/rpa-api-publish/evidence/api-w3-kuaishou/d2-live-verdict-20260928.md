# D2 快手发布按钮 — 2026-09-28 活体正向取证结论

> 本文是 `d2-selector-forensics-20260927.md` 所缺的「正向 DOM 证据」的补全：活体发布流全程被值守捕获器
> （`.agent_context/w3livefix-staging/watch-rpa-view.js`，CDP DOM 域，每 6s 快照）记录，38 张快照落
> `.agent_context/w3livefix-staging/rpa-captures/`，关键快照副本随本 PR 入库为
> `d2-live-evidence-20260928-snapshot005.json`。

## 活体条件（runbook 步骤 B→D 全部满足）

- 用户本人过 passport jigsaw 滑块登录（2026-09-28 10:10，凭证 21 cookies 落库，`CHECK_LOGIN_SUCCESS` 选择器命中）
- 真实发布流：视频 01.mp4 上传完成（CDP `DOM.setFileInputFiles`，25s）→ 标题/封面/AI 声明填写 → 发布
- 两轮发布尝试，失败签名一致：`publish signal lacked platform ID; responses=0`（点击未触发任何发布 API）

## 决定性证据（snapshot-005：上传完成后的编辑页，htmlLen=786,584）

真提交钮与同页干扰项的完整 DOM：

| 元素 | 完整 HTML | 判定 |
|---|---|---|
| `<span>` 立即发布 | `<span>立即发布</span>` | **真提交钮**——裸 span，无 class/id/data 属性 |
| `<span>` 定时发布 | `<span>定时发布<img data-cdn-hooked="true" src="data:image/svg+xml,...">` | 定时发布动作（含内联 SVG） |
| `<span>` 发布作品 | `<span data-v-08ce92df="">发布作品</span>` | 顶导航（历史误匹配源） |
| `<button>` 确定 | `<button class="el-button confirm__btn el-button--primary el-button--medium " disabled>` | 草稿弹窗（disabled） |

## 决策树判定（runbook 步骤 E）：**(A) 选择器漏配**

- `button:has-text("发布")` / `button:has-text("发表")`：**不命中**（真钮是 span，不是 button）——活体日志实测两候选 3s 超时
- `span:has-text("发 布")`：**不命中**（真钮文本是「立即发布」无空格）——同上超时
- `span:has-text("发布")`：**三重歧义命中**（发布作品/立即发布/定时发布都含「发布」）——日志显示该候选未超时（找到了元素并点击），但 `responses=0` 证明点错对象
- `span:has-text("立即投稿")` / `[class*="submit"]` / `[class*="publish"] button`：**不命中**（真钮无 class、文本不是立即投稿）
- (B) 上传守卫问题：**排除**——本轮活体日志显示守卫正常（file uploaded → 填表 → 才尝试发布），非旧代码的「未上传完就点」

## 修复（随本 PR）

`platform-selectors.js` kuaishou `publish_btn` 首位新增 `span:has-text("立即发布")`（精确文案、唯一命中真钮、
零歧义）；旧 7 候选全部保留在后兜底（页面改版回退路径）。回归锁：`platform-selectors.test.js`
（首位断言 + 旧候选兜底断言）+ `rpa-selector-utils.test.js` 4 例（活体 fixture 精确命中 / 旧候选歧义演示 /
登录页负例 / 空表单负例）。

## 残余

- 活体发布验收（3.5 / 6.3）待本修复合并后重跑一次真实发布（间隔 ≥18min，私密优先，风控即停）。
- API 轨 `taskData.video.path required`（第二轮日志）是另一独立缺陷（API-first 轨的 taskData 形状），
  不在本 D2 修复范围，另行登记。
