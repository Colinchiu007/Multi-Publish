#!/usr/bin/env bash
# session-init.sh — 会话启动时自动检测主目录状态，必要时创建 worktree
# 用法: bash scripts/session-init.sh [task-name]
# 无参数时只检查状态并修复；有参数时额外创建 worktree

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP_WORKTREES="D:/Data/projects/mp-worktrees"

cd "$REPO_ROOT"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}=== session-init: 检查主目录状态 ===${NC}"

# 1. 检查当前分支
CURRENT_BRANCH=$(git branch --show-current)
echo -e "当前分支: ${YELLOW}$CURRENT_BRANCH${NC}"

# 2. 如果已经在 main，检查是否有未提交变更
if [ "$CURRENT_BRANCH" = "main" ]; then
    DIRTY=$(git status --porcelain | wc -l)
    if [ "$DIRTY" -gt 0 ]; then
        echo -e "${YELLOW}⚠ 主目录有 $DIRTY 个未提交文件，自动 stash...${NC}"
        git stash push --include-untracked -m "session-init auto-stash $(date +%Y-%m-%d_%H%M)" 
        echo -e "${GREEN}✓ 已 stash${NC}"
    else
        echo -e "${GREEN}✓ 主目录在 main，状态干净${NC}"
    fi
    
    # 如果有任务名参数，创建 worktree
    if [ -n "${1:-}" ]; then
        TASK_NAME="$1"
        BRANCH="codex/$TASK_NAME"
        WT_PATH="$MP_WORKTREES/mp-$TASK_NAME"
        
        echo -e "\n${CYAN}=== 创建 worktree: $TASK_NAME ===${NC}"
        
        if [ -d "$WT_PATH" ]; then
            echo -e "${YELLOW}⚠ worktree 已存在: $WT_PATH${NC}"
        else
            if git branch --list "$BRANCH" | grep -q "$BRANCH"; then
                # 分支已存在，从 main 创建 worktree
                "$GWM" add -s "$BRANCH" 2>/dev/null || \
                git worktree add "$WT_PATH" "$BRANCH"
            else
                # 新建分支 + worktree
                "$GWM" add -b -s "$BRANCH" 2>/dev/null || \
                git worktree add -b "$BRANCH" "$WT_PATH"
            fi
            echo -e "${GREEN}✓ worktree 创建完成: $WT_PATH${NC}"
        fi
        
        # 安装依赖（如果需要）
        if [ -f "$WT_PATH/package.json" ]; then
            echo -e "${CYAN}安装依赖...${NC}"
            cd "$WT_PATH"
            pnpm install --frozen-lockfile 2>/dev/null && \
            node scripts/ensure-electron.js 2>/dev/null && \
            node scripts/verify-worktree-deps.js 2>/dev/null && \
            echo -e "${GREEN}✓ 依赖就绪${NC}" || \
            echo -e "${YELLOW}⚠ 依赖安装有问题，请手动检查${NC}"
            cd "$REPO_ROOT"
        fi
        
        echo -e "\n${GREEN}👉 请切换到 worktree 工作:${NC}"
        echo -e "   cd $WT_PATH"
    fi
    exit 0
fi

# 3. 主目录不在 main → 自动修复
echo -e "${RED}⚠ 主目录不在 main (当前: $CURRENT_BRANCH)${NC}"
echo -e "${CYAN}自动修复中...${NC}"

# 检查是否有未提交变更
DIRTY=$(git status --porcelain | wc -l)
if [ "$DIRTY" -gt 0 ]; then
    echo -e "${YELLOW}暂存 $DIRTY 个未提交文件...${NC}"
    git stash push --include-untracked -m "session-init auto-stash from $CURRENT_BRANCH $(date +%Y-%m-%d_%H%M)"
    echo -e "${GREEN}✓ 已 stash${NC}"
fi

# 切回 main
echo -e "切回 main..."
git checkout main
echo -e "${GREEN}✓ 已切回 main${NC}"

# 清除 expected-branch
if [ -f ".agent_context/expected-branch" ]; then
    rm -f ".agent_context/expected-branch"
    echo -e "${GREEN}✓ 已清除 expected-branch${NC}"
fi

# 拉取最新
git pull --ff-only 2>/dev/null && echo -e "${GREEN}✓ 已拉取最新${NC}" || echo -e "${YELLOW}⚠ pull 失败，请手动处理${NC}"

# 如果有任务名参数，创建 worktree
if [ -n "${1:-}" ]; then
    TASK_NAME="$1"
    BRANCH="codex/$TASK_NAME"
    WT_PATH="$MP_WORKTREES/mp-$TASK_NAME"
    
    echo -e "\n${CYAN}=== 创建 worktree: $TASK_NAME ===${NC}"
    
    if [ -d "$WT_PATH" ]; then
        echo -e "${YELLOW}⚠ worktree 已存在: $WT_PATH${NC}"
    else
        git worktree add -b "$BRANCH" "$WT_PATH"
        echo -e "${GREEN}✓ worktree 创建完成: $WT_PATH${NC}"
    fi
    
    echo -e "\n${GREEN}👉 请切换到 worktree 工作:${NC}"
    echo -e "   cd $WT_PATH"
fi

echo -e "\n${GREEN}=== session-init 完成 ===${NC}"
