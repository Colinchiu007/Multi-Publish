# Requirements — 桌面启动依赖可靠性

## 背景（差异审计结论）
- 根因：`@remotion/renderer@4.0.509` 未发布（remotion 其余包 4.0.509 均存在），仓库 `^4.0.484` 范围被重解析到 4.0.509 → 每次 `npm install` ETARGET。
- 现状：lockfile 锁定 4.0.484（完整存在），`npm ci` 可用；今日 12:19 并发中断 npm 操作损坏 @img/*、@element-plus/icons-vue、@ctrl/tinycolor → Vite 预构建失败 → 504 → 空白。
- 已交付/无需重复：sharp/@img/colour/icons-vue/tinycolor 已手工修复（未入库）；本次承载真实待办 = 版本 pin + 自愈工具 + 文档。

## 待办（新增：启动契约封装）
3. scripts/start-desktop.ps1 + start-desktop-identity.js：一键「最新代码 + 正确工作区」启动契约（定工作区/同步/端口归属 fail-closed/清旧实例/依赖健康/证据输出）。
1. root package.json `remotion` 与 packages/remotion-composer 全部 `@remotion/*` 从 `^4.0.484` 改为精确 `4.0.484`。
2. 新增 scripts/ensure-desktop-deps.js：校验脆弱依赖（sharp 平台包、@img/colour、@element-plus/icons-vue、@ctrl/tinycolor 及 desktop 直接依赖），缺失时 npm pack 旁路补装；失效陈旧 Vite optimize 缓存。
3. 测试（node --test）覆盖纯逻辑：依赖清单解析、缺失判定、恢复命令构造。
4. 文档：CHANGELOG、.quality-gates.md 记录、01-docs/learnings.md 复盘。

## 验收标准（追加）
- start-desktop.ps1 端到端：从 mp-desktop-dev（origin/main）启动，窗口 handle 非零 + Vite 归属同 worktree + identity authenticated。
- `npm install --package-lock-only --ignore-scripts` 成功（无 ETARGET）。
- `node --test scripts/ensure-desktop-deps.test.js` 全绿。
- 脚本对健康树 --check 通过；对模拟缺失能识别（restore 路径经真实 npm pack 验证过）。
- 分支 + PR + CI 证据；remoteStatus 记录。


