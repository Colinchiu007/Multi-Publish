#!/usr/bin/env bash
# fix-worktree-node-modules.sh — 交付 worktree node_modules 根治（可选执行）
#
# 背景：worktree 的 node_modules/@multi-publish/* 是指向主仓库 packages 的 junction/symlink，
# 导致 @multi-publish/ai-writer 解析到主仓库副本，而测试直连本 worktree packages/ 副本 →
# 双模块实例 → ai-writer-flow instanceof AiWriter 本地 1 例失败（主仓库/CI 全绿，环境差异）。
#
# 根治：删除 junction，在 worktree 内独立 npm install（workspace 会建立指向本 worktree
# packages/ 的正确链接）。约需 1.5GB 磁盘 + 数分钟。
#
# 用法：
#   bash scripts/fix-worktree-node-modules.sh [--worktree <dir>] [--skip-stop]
# 前置：确认 C 盘空间充足；运行中的应用会先被停止（除非 --skip-stop）。
set -euo pipefail

WORKTREE="${1:-C:/tmp/Multi-Publish-output-resolution-capability}"
SKIP_STOP=0
[ "${2:-}" = "--skip-stop" ] && SKIP_STOP=1

realpath_worktree() { (cd "$WORKTREE" && pwd -W 2>/dev/null || pwd); }
WT="$(realpath_worktree)"
MAIN="/d/Data/projects/Multi-Publish"

echo "[fix] worktree = $WT"
case "$WT" in
  /c/tmp/*|C:/tmp/*) ;;
  *) echo "[fix] REFUSE: worktree 必须在 C:/tmp 下"; exit 1 ;;
esac
[ -f "$WT/apps/desktop/package.json" ] || { echo "[fix] 不是有效 worktree（缺 apps/desktop/package.json）"; exit 1; }

# 校验 node_modules 是否 junction 指向主仓库
if [ -L "$WT/node_modules" ] || [ -L "$WT/node_modules/@multi-publish/ai-writer" ]; then
  echo "[fix] 检测到 junction/symlink（当前为环境差异状态），执行根治..."
else
  echo "[fix] node_modules 非 junction（已是独立安装），无需处理"; exit 0
fi

# 停运行中的应用（占用 node_modules 句柄）
if [ "$SKIP_STOP" = "0" ]; then
  echo "[fix] 停止运行中的 Electron 实例（CDP 9333）..."
  powershell -NoProfile -Command "\$p = Get-NetTCPConnection -LocalPort 9333 -State Listen -ErrorAction SilentlyContinue; if (\$p) { taskkill /PID \$p.OwningProcess /T /F | Out-Null; Write-Output 'stopped' } else { Write-Output 'none' }" || true
  sleep 2
fi

# 删除 junction（node_modules 本身或其内 @multi-publish 链接）
echo "[fix] 删除 junction..."
if [ -L "$WT/node_modules" ]; then rm -rf "$WT/node_modules"; fi
# npm workspace 安装后 @multi-publish/* 会重建为指向本 worktree packages/ 的链接

echo "[fix] 在 worktree 内执行 npm install（workspace 依赖）..."
cd "$WT"
npm install --no-audit --no-fund

echo "[fix] 验证 @multi-publish/ai-writer 解析..."
node -e "console.log(require.resolve('@multi-publish/ai-writer'))"

echo "[fix] 完成。全量测试验证：cd apps/desktop && npx vitest run electron/services/ai-writer-flow.integration.test.js"
