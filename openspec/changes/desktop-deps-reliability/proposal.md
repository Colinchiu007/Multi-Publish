# Proposal — desktop-deps-reliability

## Why
每次启动桌面应用都伴随「依赖损坏 → Vite 504 → 空白」连环故障。根因是 remotion 版本集不完整（`@remotion/renderer@4.0.509` 未发布，`^4.0.484` 被重解析到它）导致 `npm install` 必然失败；失败的安装会把 node_modules 弄坏（@img/*、icons-vue、tinycolor 丢失），Vite 预构建随之失败。需要根因修复 + 自愈防线，让启动不再依赖手工救援。

## What Changes
- 将 root `package.json` 的 `remotion` 与 `packages/remotion-composer/package.json` 的 `@remotion/*` 从 `^4.0.484` 精确固定为 `4.0.484`（与 lockfile 一致、全部已发布），使 `npm install`/`npm ci` 恢复可复现。
- 新增 `scripts/ensure-desktop-deps.js`（零依赖 Node 工具）：启动前校验脆弱依赖（sharp 平台包、@img/colour、@element-plus/icons-vue、@ctrl/tinycolor 及 apps/desktop 直接依赖），缺失时用 `npm pack` 旁路补装；对陈旧 Vite optimize 缓存执行失效（改名），消除 504 空白。
- 配套测试 `scripts/ensure-desktop-deps.test.js`（node --test）与文档（CHANGELOG / .quality-gates.md / 01-docs/learnings.md）。

## Capabilities
- **New Capabilities**:
  - `desktop-deps-reliability` — 桌面开发启动的依赖可复现性与自愈契约。
- **Modified Capabilities**: 无（不改变既有运行行为规格）。

## Impact
- 依赖声明：root `package.json`、`packages/remotion-composer/package.json`（`^4.0.484` → `4.0.484`）。
- 新增工具：`scripts/ensure-desktop-deps.js` + 测试；不改动 `apps/desktop` 运行时代码。
- 副作用：`remotion` 系列将不再跟随 4.0.5xx 补丁更新，后续升级需显式提交（可回退）。
