# 需求与约束

## 用户可见问题
- 在桌面应用进入【视频创作】→【图片轮播】，输入 `1` 并点击【启动流水线】时，弹出泛化提示“当前操作未能完成，请稍后再试。”。
- 该提示必须保留现有中文默认语言，并在登录状态/许可证不足时给出可行动的登录与权益提示。

## 诊断边界
- `pipeline:startOrchestrated` 是受保护 IPC；身份服务存在时需要 `authenticated` 或 `offline_authenticated`。
- IPC `code=-3` 是桌面端 `AUTH_ERROR`，不是流水线业务生成失败。
- 不得通过放宽权限、开发环境变量或绕过身份服务来修复。

## 调试 profile
- 本地调试使用固定的 Electron userData 目录，通过现有 `ELECTRON_USER_DATA_DIR` 显式指定，例如 `C:\tmp\Multi-Publish-debug-profile`。
- 不把 profile、Cookie、Local Storage、SQLite 或 DPAPI 凭据提交到仓库。
- 同一 Windows 用户和同一台机器可复用该 profile；远程部署必须使用独立 userData，部署前再清理本地调试 profile。
- 真实 Logto 会话是否仍有效必须通过当前应用的身份状态确认，不能仅凭 profile 目录存在判断已登录。

## 验收标准
- 权限拒绝响应显示稳定的 `story2video.access_denied`，中文文案明确要求登录并确认账号权益。
- 普通错误仍显示原有泛化提示；模型未配置、文本为空/超长等现有映射不回归。
- 输入 `1` 的 CreateView 流程继续调用 `pipeline:startOrchestrated`，不因本次提示修复改变参数合同。
- 定向 Story2Video 通知与 CreateView 测试全绿，Vue 构建通过。
- 不声称真实 Logto、供应商 API 或远程部署验收已通过，除非有独立现场证据。
