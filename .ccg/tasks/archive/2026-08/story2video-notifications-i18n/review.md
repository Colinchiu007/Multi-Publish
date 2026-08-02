# 审查记录：Story2Video 通知本地化与文案边界

日期：2026-08-02
任务：`story2video-notifications-i18n`

## 审查范围

- Story2Video 6000 Unicode 文案合同、旧场景数拒绝移除。
- CreateView / ResultView 的单一应用内通知呈现。
- 中英消息目录、稳定 message key 与参数白名单。
- 结果页导出、路径、裁剪、分段、重新合成与删除确认路径。

## 审查结果

- CRITICAL：0
- WARNING：0（已关闭：重新合成预览 URL 失败或缺失时不得显示成功；IPC Promise rejection 必须转为本地化失败；自定义模板删除不得使用原生 `window.confirm`。）
- INFO：最终通知目录默认中文，`en` / `en-US` 显示英文；技术错误和未获批准参数不会展示给用户。

## 审查方式与限制

- 依照 CCG 要求尝试双外部审查：antigravity 缺少 `agy`，Claude wrapper 以 status 1 退出；私有源码未绕过策略外发。
- 替代措施：两个相互独立的只读本地审查员完成最终差异审查，并在修补后复审。

## 验证

- 8 个 Story2Video 聚焦 Vitest 文件：187/187 通过。
- 最终 CreateView / ResultView / 通知目录定向 Vitest：4 文件、93/93 通过。
- 精确 ESLint：通过。
- Vue 生产构建：E 盘独立输出，1826 modules，exit 0。
- 当前源码已在 `E:\Multi-Publish-builds\story2video-notifications-i18n-fix\final-current-20260802` 重新完成 Windows `--win --x64` 打包（exit 0）；ASAR logger、解包后的 RPA 入口和随包 `ffprobe` 均通过。该当前产物的隐藏 GUI 启动仍待用户明确授权，因为独立 `--user-data-dir` 无法被本机权限策略视为绝对隔离；不得将较早产物的 8 秒启动证据冒充为当前最后 renderer 增量的证据。
