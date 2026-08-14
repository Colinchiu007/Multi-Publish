#!/usr/bin/env bash
# session-cleanup.sh — 任务结束时清理 worktree，恢复主目录
# 用法: bash scripts/session-cleanup.sh [worktree-path]
# 无参数时列出所有可清理的 worktree；有参数时清理指定 worktree

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP_WORKTREES="D:/Data/projects/mp-worktrees"

cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# 无参数：列出可清理的 worktree
if [ -z "${1:-}" ]; then
    echo -e "${CYAN}=== 可清理的 worktree ===${NC}"
    echo ""
    
    # 检查主目录
    MAIN_BRANCH=$(cd "$REPO_ROOT" && git branch --show-current)
    if [ "$MAIN_BRANCH" != "main" ]; then
        echo -e "${RED}⚠ 主目录不在 main (当前: $MAIN_BRANCH)${NC}"
        echo -e "  运行: bash scripts/session-init.sh 自动修复"
        echo ""
    fi
    
    # 列出 worktree
    git worktree list | while IFS= read -r line; do
        path=$(echo "$line" | awk '{print $1}')
        branch=$(echo "$line" | grep -oP '\[.*?\]' | tr -d '[]')
        
        # 跳过主目录
        if [ "$path" = "$REPO_ROOT" ]; then
            continue
        fi
        
        # 检查是否有未提交变更
        cd "$path" 2>/dev/null || continue
        dirty=$(git status --porcelain 2>/dev/null | wc -l)
        cd "$REPO_ROOT"
        
        if [ "$dirty" -gt 0 ]; then
            echo -e "  ${YELLOW}● $path${NC} ($branch) — $dirty 个未提交文件"
        else
            echo -e "  ${GREEN}○ $path${NC} ($branch) — 干净，可安全清理"
        fi
    done
    
    echo ""
    echo -e "用法: bash scripts/session-cleanup.sh <worktree-path>"
    echo -e "      bash scripts/session-cleanup.sh --all-safe  (清理所有干净的 worktree)"
    exit 0
fi

# --all-safe：清理所有干净的 worktree
if [ "$1" = "--all-safe" ]; then
    echo -e "${CYAN}=== 清理所有干净的 worktree ===${NC}"
    git worktree list | while IFS= read -r line; do
        path=$(echo "$line" | awk '{print $1}')
        branch=$(echo "$line" | grep -oP '\[.*?\]' | tr -d '[]')
        
        if [ "$path" = "$REPO_ROOT" ]; then
            continue
        fi
        
        cd "$path" 2>/dev/null || continue
        dirty=$(git status --porcelain 2>/dev/null | wc -l)
        cd "$REPO_ROOT"
        
        if [ "$dirty" -eq 0 ]; then
            echo -e "清理: $path ($branch)"
            git worktree remove "$path" 2>/dev/null && \
                echo -e "${GREEN}✓ 已删除${NC}" || \
                echo -e "${RED}✗ 删除失败${NC}"
        else
            echo -e "${YELLOW}跳过: $path ($branch) — 有未提交变更${NC}"
        fi
    done
    
    # 确保主目录在 main
    MAIN_BRANCH=$(git branch --show-current)
    if [ "$MAIN_BRANCH" != "main" ]; then
        echo -e "\n${YELLOW}主目录不在 main，自动切回...${NC}"
        git stash push --include-untracked -m "session-cleanup auto-stash" 2>/dev/null
        git checkout main
        echo -e "${GREEN}✓ 主目录已切回 main${NC}"
    fi
    
    echo -e "\n${GREEN}=== 清理完成 ===${NC}"
    exit 0
fi

# 指定 worktree 路径
WT_PATH="$1"
if [ ! -d "$WT_PATH" ]; then
    echo -e "${RED}✗ worktree 不存在: $WT_PATH${NC}"
    exit 1
fi

cd "$WT_PATH"
BRANCH=$(git branch --show-current)
DIRTY=$(git status --porcelain | wc -l)
cd "$REPO_ROOT"

echo -e "${CYAN}=== 清理 worktree ===${NC}"
echo -e "路径: $WT_PATH"
echo -e "分支: $BRANCH"
echo -e "未提交: $DIRTY 个文件"

if [ "$DIRTY" -gt 0 ]; then
    echo -e "${YELLOW}⚠ 有未提交变更，先提交或 stash...${NC}"
    cd "$WT_PATH"
    git stash push --include-untracked -m "cleanup auto-stash from $BRANCH"
    cd "$REPO_ROOT"
fi

# 删除 worktree
git worktree remove "$WT_PATH" && \
    echo -e "${GREEN}✓ worktree 已删除${NC}" || \
    echo -e "${RED}✗ 删除失败${NC}"

# 确保主目录在 main
MAIN_BRANCH=$(git branch --show-current)
if [ "$MAIN_BRANCH" != "main" ]; then
    echo -e "${YELLOW}主目录不在 main，切回...${NC}"
    git checkout main
fi

echo -e "${GREEN}=== 清理完成 ===${NC}"
