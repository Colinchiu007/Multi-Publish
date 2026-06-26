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

# ---- 获取变更文件列表 ----
# 使用 merge-base 确保只检查 PR 引入的变更
MERGE_BASE=$(git merge-base "$BASE" "$HEAD")
CHANGED=$(git diff --name-only "$MERGE_BASE".."$HEAD")

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
# 先看 PRD / 文档是否有变更
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
while IFS= read -r file; do
  # 跳过文档类
  if [[ "$file" =~ $PRD_FILES ]]; then
    continue
  fi
  # 跳过 CI 流程文件
  if [[ "$file" =~ ^\.github/ ]]; then
    continue
  fi
  # 跳过脚本工具
  if [[ "$file" =~ ^team/scripts/ ]]; then
    continue
  fi
  # 忽略 node_modules 和构建产物
  if [[ "$file" =~ node_modules|dist/ ]]; then
    continue
  fi
  CODE_CHANGED=true
  break
done <<< "$CHANGED"

# ---- 判定 ----
if [ "$CODE_CHANGED" = false ]; then
  echo "✅ 仅文档/流程变更，无需额外同步"
  exit 0
fi

if [ "$DOCS_CHANGED" = false ]; then
  echo "❌ 代码/配置有变更，但未同步更新 PRD 或相关文档"
  echo ""
  echo "  请在 PR 中包含对应变更："
  echo "    - 功能变更 → 更新 PRD.md 对应章节"
  echo "    - 产品逻辑变更 → 更新 PRD.md 用户流程说明"
  echo "    - 架构变更 → 更新 PRD.md 架构章节"
  echo ""
  echo "  如需绕过此门禁，请添加 'bypass-doc-gate' label"
  exit 1
fi

echo "✅ 文档同步检查通过！"
echo "  代码变更已同步更新文档。"
