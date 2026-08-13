# Design — desktop-deps-reliability

## 决策记录
| 决策 | 选择 | 备选 | 理由 |
|------|------|------|------|
| remotion 版本策略 | 精确 pin `4.0.484` | 升级到最新完整版本集（如 4.0.5xx 中 renderer 存在的最新版） | 与 lockfile 一致、零迁移成本、可回退；后续升级单独提交 |
| 依赖补装方式 | `npm pack` + 解包到 node_modules | `npm install` / `npm ci` | 整树安装被 ETARGET 阻塞（本 change 修复后不再需要旁路，但脚本保留作为防并发中断的兜底）；npm pack 只下载目标包，不改 lockfile |
| 缓存失效方式 | 改名（rename）而非删除 | 递归删除 | Windows 安全策略/并发进程持锁时 rename 更可靠、可逆 |
| 脚本形态 | 零依赖 Node（node:test 单测） | PowerShell 脚本 | 跨 shell 一致性 + 可单测 |

## 组件
- `scripts/ensure-desktop-deps.js`：
  - `--check`：仅校验并输出报告，缺失返回非零。
  - `--restore`（默认）：对缺失包执行 npm pack + 解包恢复。
  - `--invalidate-vite-cache`：将 `apps/desktop/node_modules/.vite/deps`（存在时）改名 `*.stale-<ts>`。
  - 脆弱依赖清单：`@img/sharp-win32-x64`(平台包完整性 index.cjs)、`@img/colour`、`@element-plus/icons-vue`、`@ctrl/tinycolor` + `apps/desktop` 全部直接 dependencies 的存在性校验。
- 恢复命令：`npm pack <pkg>@<ver> --pack-destination <tmp>` → `tar -xzf` → 复制到 `<repo>/node_modules/<scoped-path>`。

## 风险与回退
- **并发 npm 操作**：脚本不碰 lockfile/package.json，仅写 node_modules；建议仍遵守「共享工作区禁止并行 npm install」纪律。
- **remotion pin 副作用**：remotion 系列停在 4.0.484；若未来需要升级，单独 change 显式升级，回退 = 恢复 `^`。
- **npm pack 依赖 registry 可用**：网络不可用时脚本报告 UNRESOLVED，不破坏现有状态（fail-open 于只读检查、fail-closed 于恢复动作报错退出）。

## 测试目标
- 纯逻辑单测：依赖清单解析、缺失判定、恢复命令构造（不执行真实 npm pack）。
- 集成冒烟（真实环境）：健康树 `--check` 通过；模拟缺失（临时改名 tinycolor）→ `--restore` 自动恢复 → require 成功。
