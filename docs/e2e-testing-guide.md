# E2E 端到端测试指南

## 测试分层

| 层 | 名称 | 运行方式 | 需要凭据 | CI |
|----|------|---------|---------|----|
| L0 | 单元测试 | `npm test` (Jest) / `npm run test:vue` (Vitest) | 否 | ✅ |
| L1 | Smoke 测试 | `node tests/e2e-smoke.js` | 否 | ✅ |
| L2 | GUI 测试 | `node tests/electron-gui-v9.js` (需 xvfb) | 否 | ⚠️ 不稳定 |
| L3 | API 模式 E2E | `node tests/e2e-api-publish.js --dry-run` | API Key (可选) | 🔲 待实现 |
| L4 | 完整 RPA E2E | `node tests/e2e-interactive-login.js` | 账号凭据 | ❌ 本地 |

## 快速开始

### L1: Smoke 测试（无需启动应用）

```bash
# 确保 Vite 开发服务器在 5174 端口运行
cd apps/desktop && npx vite --port 5174 &

# 运行 smoke 测试
node apps/desktop/tests/e2e-smoke.js
```

### L2: GUI 测试（需图形环境）

```bash
cd apps/desktop
npx vite --port 5174 &
xvfb-run node tests/electron-gui-v9.js
```

### L4: 完整 E2E（需真实账号）

1. 复制凭据模板:
   ```bash
   cp config/e2e-credentials.template.json config/e2e-credentials.json
   ```
2. 编辑 `e2e-credentials.json`，填入账号 Cookie 或 API Key
3. 运行交互式登录测试:
   ```bash
   node apps/desktop/tests/e2e-interactive-login.js
   ```

## 凭据管理

- `config/e2e-credentials.template.json` — 模板文件，**可提交到 git**
- `config/e2e-credentials.json` — 真实凭据，**已加入 .gitignore，永不提交**
- CI 中通过 GitHub Secrets 注入: `E2E_CREDENTIALS_JSON`
- 支持 15 个平台 + 3 个 API Key

## 平台覆盖

| 平台 | L1 Smoke | L2 GUI | L3 API | L4 RPA |
|------|----------|--------|--------|--------|
| 微信公众平台 | - | ✅ | 🔲 | 🔲 |
| 知乎 | - | ✅ | 🔲 | 🔲 |
| 微博 | - | ✅ | 🔲 | 🔲 |
| 抖音 | - | ✅ | 🔲 | 🔲 |
| 小红书 | - | ✅ | 🔲 | 🔲 |
| 视频号 | - | ✅ | 🔲 | 🔲 |
| 快手 | - | ✅ | 🔲 | 🔲 |
| 今日头条 | - | ✅ | 🔲 | 🔲 |
| YouTube | - | ✅ | 🔲 | 🔲 |
| TikTok | - | ✅ | 🔲 | 🔲 |
| B站 | - | ✅ | 🔲 | 🔲 |
| 百家号 | - | ✅ | 🔲 | 🔲 |

## 编写新测试

### Smoke 测试

在 `tests/e2e-smoke.js` 中添加新测试组:

```js
console.log("\\nN. 新测试组");
try {
  const result = await someTest();
  assert(result.ok, "测试描述");
} catch (e) {
  assert(false, "失败: " + e.message);
}
```

### GUI 测试

在 `tests/electron-gui-v9.js` 中添加新函数:

```js
async function testNewFeature(win) {
  console.log("\\n≡≡≡ 新页面 ≡≡≡");
  await win.evaluate((r) => { window.location.hash = "#" + r; }, ROUTES.newRoute);
  await wait(3000);
  assert("页面加载", true);
  await win.screenshot({ path: path.join(SS, "v9-new-feature.png") });
}
```

## CI 配置

GUI 测试在工作流 `.github/workflows/gui-test.yml` 中定义:

- **触发条件**: PR 到 main / push 到 main 或 codex/gui-test*
- **运行环境**: Ubuntu + xvfb
- **超时**: 15 分钟
- **失败处理**: 自动上传截图到 CI artifacts
- **降级策略**: GUI 测试失败时自动降级到 smoke 测试
