# Story2Video 媒体预览 Bug Reflection

## 第一性根因

Story2Video 使用受控的本机令牌媒体服务后，媒体 URL 变为 http://127.0.0.1:随机端口。既有 CSP 的 media-src 只允许 self 和 blob，浏览器会在请求前拒绝新 URL。该 CSP 来自 d4d8ce1，之后引入媒体服务时未同步扩展资源策略。

## 逃逸链

1. 单元测试覆盖令牌、TTL、Range 和 IPC，但未把 CSP 与真实媒体 URL 联合断言。
2. 组件和 E2E 主要验证 mock/存在性，没有读取 currentSrc、readyState 和 error。
3. 审查覆盖了路径保密与回环绑定，遗漏 CSP 资源类别。
4. 自定义协议被 Chromium URL 安全检查拒绝后切换到 HTTP 服务，但 CSP 合同未随实现变化更新。

## 修复与保护

- 服务仅绑定 127.0.0.1，使用高熵令牌、短 TTL、容量限制和 Range 支持，并拒绝查询参数、未知 URL 与非 GET/HEAD。
- CSP 只增加 media-src 的 http://127.0.0.1:*，不放宽为任意 http。
- index.test.js 固化 CSP 边界；媒体服务、IPC 和真实 Electron 预览回归均通过。
- 真实窗口中视频和旁白 currentSrc 均为令牌 URL，readyState=4，error=null。
