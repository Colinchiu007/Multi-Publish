# Review — model-provider-write-requires-login

## 审查方式（降级说明）

CCG 规范 M+ 高风险任务应双模型审查。本轮探测：claude（codeagent-wrapper）30s 无输出（与上一任务一致，后端不可用）；antigravity 上一任务已确认区域不可用。按「机制硬化规则」降级为主代理自审，证据见上。

## 审查结论

🔴 CRITICAL：0　🟠 MAJOR：0　🟢 MINOR/INFO：见下

## 逐项核对

1. **主进程门禁**：`license-access-control.js` PUBLIC_CHANNELS 移除 5 个写通道（create/update/delete/set-default/clean-logs）→ 默认 authenticated；读通道（list/get/get-default/test/presets/is-configured/logs）保持 public。
2. **preload 暴露**：`access-control.js` PUBLIC_METHODS 同步移除 5 个写方法；写方法默认 authenticated（未登录调用抛 LicensePermissionError，不触达底层）。
3. **一致性**：preload.test.js「所有 preload 公开 invoke 方法对应通道保持公开」测试自动跟随 PUBLIC_METHODS，无需手改；已跑通。
4. **双层强制**：渲染层 preload 权限 + 主进程 access level 双保险；未登录（identity signed_out / 无 Pro license）写操作在两层均被拒。
5. **离线语义保留**：读/测试连接 public——未登录仍可查看并使用已配置模型（本地钥匙串语义）。
6. **测试**：新增主进程行为测试（未登录拒 create、登录放行）+ preload 暴露测试（public 拒写/authenticated 放行）；实际运行 electron/ipc-handlers + preload 全目录 733 passed。sandbox 验证未跑（access-control 变化不影响 sandbox 兼容性，bundle 已重建）。
7. **PRD**：01-docs/PRD.md 7.4 新增「权限与访问控制」小节，记录读开放/写需登录策略与约束。

## MINOR（非阻塞）

- 渲染层未登录点击保存/删除会显示「当前许可证无权访问 model-provider:xxx」，提示不够友好，可后续在 useModelProviderCrud 对 AUTH_ERROR 提示「请先登录」。
- e2e 若在真实未打包未登录环境跑 modelProviderUpdate 会被主进程拒绝（ipc-mock 环境不受影响）；CI 若用真实主进程需预置登录态。
- model-provider:test（测试连接）保持 public，语义为「读+使用」，如产品认为应登录可后续调整。
