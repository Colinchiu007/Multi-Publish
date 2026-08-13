#!/usr/bin/env bash
# fix-worktree-node-modules.sh — worktree node_modules 修复（pnpm 版）
#
# 背景：历史方案用整目录 Junction 指向主仓库 node_modules，导致 @multi-publish/*
# 链接解析到主仓库源码（双模块实例 / 错误 checkout）。pnpm 迁移后该方案废弃：
# 依赖由 pnpm 全局 store 硬链接复用，workspace 链接自动指向当前 worktree。
#
# 修复流程：检测 junction/symlink → 移除 → pnpm install → verify-worktree-deps 门禁。
#
# 用法：bash scripts/fix-worktree-node-modules.sh [--worktree <dir>] [--skip-stop]
set -euo pipefail

WORKTREE=""
SKIP_STOP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --worktree) WORKTREE="${2:-}"; shift 2 ;;
    --skip-stop) SKIP_STOP=1; shift ;;
    *) WORKTREE="$1"; shift ;;
  esac
done
[ -n "$WORKTREE" ] || WORKTREE="D:/Data/projects/mp-worktrees/mp-pnpm-worktree-deps"

realpath_worktree() { (cd "$WORKTREE" && pwd -W 2>/dev/null || pwd); }
sleep_or_pause() { sleep "$1" 2>/dev/null || powershell -NoProfile -Command "Start-Sleep -Seconds $1" 2>/dev/null || true; }
WT="$(realpath_worktree)"

echo "[fix] worktree = $WT"
case "$WT" in
  /c/tmp/*|C:/tmp/*|/d/Data/projects/mp-worktrees/*|D:/Data/projects/mp-worktrees/*) ;;
  *) echo "[fix] REFUSE: worktree 必须在 D:/Data/projects/mp-worktrees 下（历史 C:/tmp 兼容）"; exit 1 ;;
esac
[ -f "$WT/apps/desktop/package.json" ] || { echo "[fix] 不是有效 worktree（缺 apps/desktop/package.json）"; exit 1; }

# 检测 junction/symlink（node_modules 本身或其内 @multi-publish 链接）
JUNCTION=0
if [ -L "$WT/node_modules" ]; then JUNCTION=1; fi
if [ -d "$WT/node_modules/@multi-publish" ] && [ -L "$WT/node_modules/@multi-publish/ai-writer" ]; then JUNCTION=1; fi

if [ "$JUNCTION" = "0" ]; then
  echo "[fix] node_modules 非 junction（pnpm 布局），无需处理"
  node "$WT/scripts/verify-worktree-deps.js" || { echo "[fix] 解析门禁失败，先执行 pnpm install"; exit 1; }
  exit 0
fi

echo "[fix] 检测到 junction/symlink（历史 npm 环境差异状态），执行修复..."
if [ "$SKIP_STOP" = "0" ]; then
  echo "[fix] 停止运行中的 Electron 实例（CDP 9333）..."
  powershell -NoProfile -Command "\$p = Get-NetTCPConnection -LocalPort 9333 -State Listen -ErrorAction SilentlyContinue; if (\$p) { taskkill /PID \$p.OwningProcess /T /F | Out-Null; Write-Output 'stopped' } else { Write-Output 'none' }" || true
  sleep_or_pause 2
fi

echo "[fix] 移除 junction..."
if [ -L "$WT/node_modules" ]; then rm -rf "$WT/node_modules"; fi
# pnpm 安装后 @multi-publish/* 会重建为指向本 worktree packages/ 的链接

echo "[fix] 在 worktree 内执行 pnpm install --frozen-lockfile（全局 store 硬链接复用）..."
cd "$WT"
pnpm install --frozen-lockfile

echo "[fix] 校验 electron 二进制..."
node scripts/ensure-electron.js || true

echo "[fix] 解析门禁验证..."
node scripts/verify-worktree-deps.js

echo "[fix] 完成。如需全量验证：pnpm --filter @multi-publish/desktop test -- --maxWorkers=1 --no-file-parallelism"
