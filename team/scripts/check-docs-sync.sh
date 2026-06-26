#!/bin/bash
# ==============================================================
# 文档同步硬门禁检查
#
# 功能：检查 PR 中代码变更是否同步更新了对应文档
# 规则：任何 .py/.js/.ts/.vue/.json/.yaml 等代码/配置变更，
#       必须同时变更 PRD.md 或 docs/ 下的文档
#
# 用法：check-docs-sync.sh --base=<branch> --head=<branch>
# ==============================================================

set -euo pipefail

# ---- 参数解析 ----
for arg in "$@"; do
  case "$arg" in
    --base=*) BASE="${arg#*=}" ;;
    --head=*) HEAD="${arg#*=}" ;;
    *) echo "❌ 未知参数: $arg"; exit 1 ;;
  esac
done

if [ -z "${BASE:-}" ] || [ -z "${HEAD:-}" ]; then
  echo "❌ 必须指定 --base 和 --head"
  exit 1
fi

echo "🔍 文档同步检查：base=$BASE  head=$HEAD"
echo ""

# ---- 在 CI 环境中确保 base 分支可用 ----
# GitHub Actions checkout 只获取当前 ref，需显式获取 base 分支
# 使用 git fetch origin 而非 git pull，避免 merge 冲突
if ! git rev-parse --verify "origin/$BASE" >/dev/null 2>&1; then
  git fetch origin "$BASE"
  # fetch 会创建 FETCH_HEAD 但不会创建 origin/$BASE
  # 需要显式创建本地跟踪分支
  if ! git rev-parse --verify "origin/$BASE" >/dev/null 2>&1; then
    echo "  origin/$BASE not found after fetch, fetching all refs..."
    git fetch origin "+refs/heads/$BASE:refs/remotes/origin/$BASE"
  fi
fi

# ---- 获取变更文件列表 ----
# 优先使用 merge-base（精确 PR diff），fallback 到直接 diff
MERGE_BASE=""
if git rev-parse --verify "HEAD" >/dev/null 2>&1; then
  # HEAD 是 PR 的 merge commit 或 head commit
  if git merge-base --is-ancestor "origin/$BASE" "HEAD" 2>/dev/null; then
    MERGE_BASE=$(git merge-base "origin/$BASE" "HEAD")
  fi
fi

if [ -n "$MERGE_BASE" ]; then
  CHANGED=$(git diff --name-only "$MERGE_BASE".."HEAD")
else
  # fallback: 直接比较与 origin/$BASE 的差异
  echo "  (using direct diff against origin/$BASE as fallback)"
  CHANGED=$(git diff --name-only "origin/$BASE".."HEAD" 2>/dev/null || \
            git diff --name-only "FETCH_HEAD".."HEAD")
fi

if [ -z "$CHANGED" ]; then
  echo "✅ 无变更，跳过检查"
  exit 0
fi

echo "变更文件列表："
echo "$CHANGED" | sed 's/^/  /'
echo ""

# ---- 文档正则 ----
PRD_FILES="(PRD\.md|CHANGELOG\.md|docs/|01-docs/|README\.md)"

# ---- 第一阶段：检查文档是否已更新 ----
DOCS_CHANGED=false
while IFS= read -r file; do
  if [[ "$file" =~ $PRD_FILES ]]; then
    DOCS_CHANGED=true
    break
  fi
done <<< "$CHANGED"

# ---- 第二阶段：检查是否有「需要文档同步」的代码变更 ----
# 排除：纯文档变更、git workflow、team/scripts、node_modules
CODE_CHANGED=false
while IFS= read