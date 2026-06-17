# Git Workflow — PROJECT-003 Multi-Publish

## 分支策略

```
main ──────────────── 线上发布版本（稳定）
    ↑
develop ───────────── 日常开发分支
    ↑
feature/xxx ───────── 功能分支（从 develop 切）
```

### 分支命名

| 类型 | 命名 | 示例 |
|------|------|------|
| 功能 | `feature/xxx` | `feature/douyin-video` |
| 修复 | `fix/xxx` | `fix/wechat-cookie-expiry` |
| 重构 | `refactor/xxx` | `refactor/monorepo` |
| 发布 | 不打分支，直接 merge develop → main |

## 合并流程

### 新功能开发

```bash
# 从 develop 切分支
git checkout develop
git pull origin develop
git checkout -b feature/douyin-video

# 开发完成后
git add -A
git commit -m "feat(publisher): add douyin video publisher"
git push origin feature/douyin-video

# 在 GitHub 上开 PR → develop
```

### 发布流程

```bash
# 1. 确认 develop 就绪
git checkout develop
git pull origin develop

# 2. 合并到 main
git checkout main
git merge develop -m "release: merge develop → main"

# 3. 打 tag
git tag v1.1.0
git push origin main
git push origin v1.1.0

# 4. CI 自动构建 → GitHub Release → auto-updater 生效
```

## Commit 规范

```
<type>(<scope>): <subject>

# 示例
feat(publisher): add youtube publisher
fix(publisher): wechat_mp cookie save path
docs(prd): update v1.0.7 architecture
refactor(monorepo): split rpa-engine into packages
chore(ci): fix build path for monorepo
test(publisher): add unit test for registry
```

**scope**: 影响范围（`publisher`, `ci`, `monorepo`, `prd`, `electron`, `python` 等）

## Rebase 规则

- `main` 分支永远不要 rebase
- `develop` 和 feature 分支可以 rebase 以保持线性
- 合并到 main 使用 `--no-ff` 保留合并 commit

## Tag 规范

- 语义化版本：`v1.1.0`（主版本.次版本.修订号）
- 每次打 tag 必须同步 `package.json` 的 `version` 字段
- Release 在 GitHub 上设为 **Latest**（非 Draft/Pre-release）
