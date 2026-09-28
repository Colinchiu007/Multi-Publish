# W3 快手发布链活体验收通过（2026-09-28 18:43）

> `kuaishou-w3-live-fix` 3.5 活体重跑通过记录。用户授权 CDP 代操作（视频路径用户提供：
> `D:\汤姆鱼成品视频\测试用途短时长的\01.mp4`，0.9 MB 测试视频）。

## 验收结论

**发布成功**：作品 ID `3xvsedz34m82ppi`，作品 URL `https://m.gifshow.com/fw/photo/3xvsedz34m82ppi`
（HTTP 200 实证在线）。D2 六年悬案（点击发布后 responses=0）完整闭环。

## 活体流程实录（app-2026-09-28.log，18:42-18:43）

```
10:42:11 RpaView [kuaishou] publish config=provided; selectorCount=10; publishButtons=8
10:42:11 RpaView [kuaishou] navigating...
10:42:14 RpaView [kuaishou] post-nav dialogs dismissed: 放弃
10:42:14 RpaView [kuaishou] uploading file...
10:42:14 RpaView CDP file: 01.mp4
10:42:39 RpaView [kuaishou] file uploaded                    ← 上传 25s
10:42:52 RpaView [kuaishou] no dedicated title field, title falls back to editor sel=#work-description-edit
10:42:52 RpaView [kuaishou] filling title...
10:42:53 RpaView [kuaishou] AI declaration result: NO_DECLARATION_FOUND
10:42:53 RpaView [kuaishou] DIAG[publish2] pubBtn=8
10:42:53 RpaView [kuaishou] publishing...
10:42:53 RpaView [kuaishou] verifying...                     ← 点击后 34ms（div:has-text("发布") 命中真钮）
10:43:21 RpaView [kuaishou] artifact lookup matched id=3xvsedz34m82ppi
10:43:21 RpaView [kuaishou] URL changed
10:43:21 RpaView publish done platform=kuaishou url=https://m.gifshow.com/fw/photo/3xvsedz34m82ppi
```

## 验收链路（runbook 步骤 B→G 全程）

| 步骤 | 结果 |
|---|---|
| B 用户登录 | ✓ 用户过滑块登录（21 cookies 落库，CHECK_LOGIN_SUCCESS 选择器命中） |
| C 应用就绪 | ✓ mp-app-live2 同步最新 main（9ba6d8d1，含 #2569 二轮定案）重启 |
| D 真实发布流 | ✓ CDP 驱动表单（视频注入/标题/快手勾选）→ 一键发布 |
| E 决策树 | ✓ (A) 选择器漏配（两轮取证：一轮 span 误判 → 二轮 div 定案） |
| F 修复落地 | ✓ #2554 + #2569 两轮 PR 合并，回归锁 + QM-1 全过 |
| G 活体验收 | ✓ 发布成功，作品 ID + URL 落袋，本文件入档 |

## 残余（不阻塞本 change 归档）

- API 轨 `taskData.video.path required`（发布流 API-first 轨数据形状缺陷）→ engine-w3 6.3 保持开放，另行登记
- `ImpactTracker addTracking is not a function` 与 `PublishMonitor Poll → error`（发布后监控轮询）→ 独立缺陷，另行登记
- 快手流程无可见性步骤（默认公开）→ 测试视频已公开，用户可在快手侧自行设私密/删除
