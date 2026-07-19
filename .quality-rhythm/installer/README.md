# 质量节拍 — 一键安装器

> 给任意项目安装质量节拍门禁，1 分钟搞定。

---

## 用法

在目标项目根目录运行：

```bash
npx degit Colinchiu007/quality-rhythm/installer .quality-rhythm
node .quality-rhythm/run.js
rm -rf .quality-rhythm
```

或直接：

```bash
npx github:Colinchiu007/quality-rhythm/installer
```

## 安装内容

| 文件 | 作用 |
|------|------|
| `.husky/pre-commit.js` | 改代码必须带测试，否则 commit 被拒 |
| `.husky/install.js` | 钩子安装脚本 |
| `.github/workflows/quality-gate.yml` | CI 自动跑测试+代码质量+合规检查 |
| `.quality-rhythm` | 项目标记文件 |
| `.claude/commands/质量节拍.md` | Claude Code 斜杠命令 |
| `.cursor/commands/质量节拍.md` | Cursor 斜杠命令 |
| AGENTS.md | 追加强制质量流程段落 |

## 前提

- Node.js >= 18
- 安装了 `gh` CLI（已 GitHub 登录） — 用于分支保护，可选

## 效果

```
日常开发流程：

git add → git commit
              ↓
         pre-commit 检查：
         改动的文件有测试吗？ → 没有 → ❌ 拒绝
              ↓
         git push
              ↓
         GitHub Actions 自动跑 quality-gate：
         测试通过？ → 不通过 → ❌ 阻断
         代码质量？ → 有问题 → ❌ 阻断
              ↓
         PR → 必须 CI 过 + 审查过 → ✅ 合并到 main
```
