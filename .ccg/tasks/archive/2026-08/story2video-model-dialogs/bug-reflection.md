# Story2Video 模型与媒体下载复盘

## 问题

- **现象**：已启用并保存 API Key 的 LLM、图片和语音模型都没有显式默认标记；Story2Video 曾提示默认 LLM 缺失。修复提示后，真实运行继续在 MiniMax 图片下载阶段失败，报 `Invalid IP address: undefined`。
- **预期**：唯一已启用且已配置的模型无需手动设置默认即可被 Story2Video 使用；运行期的模型配置或资源错误以应用内弹窗显示；真实图片 URL 应在保持 SSRF/DNS 重绑定防护的前提下成功下载。
- **复现**：在当前用户库中只启用 SenseNova LLM、MiniMax Image 和 MiniMax TTS（均 `is_default=false`），通过打包桌面应用选择 `Story2video Compose`，输入单段文案并推进资源生成检查点。

## 5 Whys

1. 为什么生成阶段失败？图片 URL 下载时 Node 抛出 `Invalid IP address: undefined`。
2. 为什么传入了 undefined？自定义 DNS `lookup` 在固定已验证地址时始终按 `(address, family)` 回调。
3. 为什么这在当前运行时无效？Electron 43 的 Node 22 连接层会以 `lookup(..., { all: true })` 请求地址列表。
4. 为什么地址没有按列表返回？`createVerifiedLookup()` 忽略了 `options.all`，没有遵守 Node 的该回调契约。
5. **第一性根因**：提交 `e1b46eb` 引入 DNS 重绑定保护时只覆盖了旧的单地址 lookup 形态，缺少 Node 22 auto-select-family 的 `all=true` 分支。

## 逃逸链

- **PRD**：缺少“真实图片 URL 下载在不同 Node DNS lookup 形态下保持安全且可用”的验收项。
- **代码**：SSRF 防护正确固定了地址，但 callback 返回类型与 `options.all` 不一致。
- **单元/集成测试**：已有 DNS 固定、重绑定和超时测试只调用 `{ family: 0 }`，没有模拟 `all: true`。
- **端到端**：旧 E2E 使用离线/受控资源，未覆盖真实 provider 返回 URL 的 Node 22 下载路径。
- **审查**：审查关注了 DNS 重绑定安全性，没有核验 Node 自定义 lookup 的所有回调契约。

## 修复与回归保护

- `asset-generator.js`：`createVerifiedLookup()` 在 `options.all === true` 时返回单一、已经验证的 `{ address, family }` 数组；否则保持原有单地址回调。不会放开任何 URL、协议、私网、DNS 或下载大小限制。
- `asset-generator-provider.test.js`：新增 `all=true` 真实回调形态，修复前 RED，修复后 GREEN。
- `model-provider-minimax-fixed-model.test.js`：锁定“唯一已启用且已配置、未显式默认”的安全回退，避免重新出现“API Key 已保存却找不到默认模型”。
- `CreateView.test.js`：锁定模型缺失和 Story2Video 输入校验均使用 `UiModal`，不再调用原生 `alert`。

## 改进措施

- **P0 测试补充**：所有自定义 Node DNS lookup 测试同时覆盖 `all=false` 与 `all=true`，并断言返回值形态。
- **P1 审查清单**：涉及 `https.request` 自定义 lookup、DNS 固定或 Node 升级时，检查 `options.all`、`family`、错误回调和重绑定测试。
- **P1 真实验证**：真实 Story2Video provider 验收必须保留模型来源、资源来源和最终 `ffprobe` 解码证据；离线占位 E2E 不能替代。
