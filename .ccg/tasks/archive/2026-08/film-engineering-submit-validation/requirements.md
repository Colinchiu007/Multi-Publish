# 视频创作电影工程参数校验提示修复

## 现象

用户进入“视频创作 → 电影工程”后，页面加载第一个场景的分镜时显示“提交的数据不符合要求。请检查输入后重试。”。

## 根因

apps/desktop/electron/ipc-handlers/film-engineering.js 的 withKit 包装器接收 IPC event 后，仅把后续参数传给内部 handler。内部带参数 handler 仍按 Electron 约定接收 (event, ...args)，因此 list-shots 等通道收到的业务参数整体左移，合法 sceneId 被校验为 undefined。

## 验收标准

- 进入电影工程页面时，受信窗口的 list-shots(sceneId) 请求成功，不再出现统一参数校验提示。
- get-shot、复制、导出等同样经过 withKit 的带参数通道按原顺序收到参数。
- 空值、超限和非受信 sender 的既有拒绝行为保持不变。
- 新增回归测试先在旧实现下失败，修复后通过。
