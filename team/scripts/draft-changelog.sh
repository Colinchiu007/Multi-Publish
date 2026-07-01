#!/bin/bash
# ==============================================================
# CHANGELOG 草稿生成
#
# 从 git log 自动生成 CHANGELOG 草稿，作为 PR 审查的参考
# 输出文件不覆盖正式 CHANGELOG.md
#
# 用法：draft-changelog.sh --output=<file>
# ==============================================================

set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    --output=*) OUTPUT="${arg#*=}" ;;
    *) echo "❌ 未知参数: $arg"; exit 1 ;;
  esac
done

if [ -z "${OUTPUT:-}" ]; then
  echo "❌ 必须指定 --output"
  exit 1
fi

# 获取 PR 的变更范围
BASE_SHA=""
if git rev-parse --verify "origin/main" >/dev/null 2>&1; then
  if git merge-base --is-ancestor "origin/main" "HEAD" 2>/dev/null; then
    BASE_SHA=$(git merge-base "origin/main" "HEAD")
  fi
fi

{
  echo "# CHANGELOG 草稿"
  echo ""
  echo "> 自动生成时间: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo ""
  if [ -n "$BASE_SHA" ]; then
    echo "## 本次变更"
    echo ""
    git log "$BASE_SHA".."HEAD" --oneline --no-decorate 2>/dev/null || echo "(无法获取变更日志)"
  else
    echo "(无法确定变更范围，请手动填写)"
  fi
  echo ""
  echo "---"
  echo "提示：将此文件内容合并到 CHANGELOG.md 前请人工审查"
} > "$OUTPUT"

echo "✅ CHANGELOG 草稿已生成: $OUTPUT"
