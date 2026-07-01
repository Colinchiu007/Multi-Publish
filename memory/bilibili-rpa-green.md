---
name: bilibili-rpa-green-phase
description: B站 RPA publish _publish_bilibili 方法实现完成，12/12 tests green
type: project
---

# B站 RPA _publish_bilibili GREEN 完成

## 完成内容
- `rpa-view-manager.js`: 新增 `_publish_bilibili(win, article)` 方法（~78 行），覆盖完整 B 站发布流程：导航 → 上传视频 → 等待上传 → 标题/简介 → 封面 → 标签 → 发布 → 检测成功
- `platform-selectors.js`: B站 选择器从 stub 更新为实测 selector，新增 `file_input`、`cover_input`、`tag_input`
- `publish-poller.js`: 实现 orchestrator 轮询 → 下载 → RPA 发布的完整链路

## 发布流程（B站）
1. 导航到 member.bilibili.com/video/upload.html
2. 检查登录态（_publish_bilibili 接受已有 cookie）
3. 上传视频文件（`input[type="file"]` → _setFileInput）
4. 等待上传进度条消失（_waitForCondition，最长 5 分钟）
5. 填写标题（`input[placeholder*="标题"]`）
6. 填写简介（`textarea[placeholder*="简介"]`）
7. 上传封面（可选，click cover trigger → _setFileInput）
8. 添加标签（input → dispatch Enter key）
9. 点击发布按钮（`button.submit-btn`）
10. 等待 API 响应（`video/recommend` 或 `archive/publish`）

## 测试
- `rpa-view-manager.test.js`: 4 tests (存在, dispatch, missing video_path error, success shape)
- `publish-poller.test.js`: 8 tests (start/stop, empty poll, download+publish flow, error handling, interval)
- 全部 12/12 passing

## 注意事项
- FUSE null-byte corruption：Edit/Write 工具可能在文件末尾注入 \x00 字节，通过 Python 写入避免
- `\'` 在 JS 单引号字符串中并非语法错误（CommonJS 模式），B站选择器字符串用此模式
