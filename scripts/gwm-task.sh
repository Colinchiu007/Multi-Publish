#!/usr/bin/env bash
# gwm-task.sh — 任务生命周期管理（纯 git worktree，无外部依赖）
# 用法:
#   bash scripts/gwm-task.sh start <task-name>   — 创建 worktree + 安装依赖
#   bash scripts/gwm-task.sh list                 — 列出所有 worktree
#   bash scripts/gwm-task.sh status               — 查看全局状态
#   bash scripts/gwm-task.sh cleanup [path]       — 清理 worktree
#   bash scripts/gwm-task.sh cleanup-all          — 清理所有干净 worktree

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP_WORKTREES="D:/Data/projects/mp-worktrees"

cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

cmd="${1:-help}"
shift || true

case "$cmd" in
    start)
        TASK_NAME="${1:?用法: gwm-task.sh start <task-name>}"
        BRANCH="codex/$TASK_NAME"
        WT_PATH="$MP_WORKTREES/mp-$TASK_NAME"
        
        # 1. 确保主目录在 main
        MAIN_BRANCH=$(git branch --show-current)
        if [ "$MAIN_BRANCH" != "main" ]; then
            echo -e "${YELLOW}主目录不在 main ($MAIN_BRANCH)，自动修复...${NC}"
            bash "$(dirname "$0")/session-init.sh"
        fi
        
        # 2. 创建 worktree
        if [ -d "$WT_PATH" ]; then
            echo -e "${YELLOW}worktree 已存在: $WT_PATH${NC}"
            echo -e "分支: $(cd "$WT_PATH" && git branch --show-current)"
        else
            echo -e "${CYAN}创建 worktree: $TASK_NAME${NC}"
            
            if git branch --list "$BRANCH" | grep -q "$BRANCH"; then
                git worktree add "$WT_PATH" "$BRANCH"
            else
                git worktree add -b "$BRANCH" "$WT_PATH"
            fi
            echo -e "${GREEN}✓ worktree 创建完成${NC}"
        fi
        
        # 3. 安装依赖
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
        
        # 4. 输出结果
        echo ""
        echo -e "${GREEN}═══════════════════════════════════════${NC}"
        echo -e "${GREEN}任务就绪: $TASK_NAME${NC}"
        echo -e "${GREEN}───────────────────────────────────────${NC}"
        echo -e "Worktree: ${CYAN}$WT_PATH${NC}"
        echo -e "Branch:   ${CYAN}$BRANCH${NC}"
        echo -e "${GREEN}───────────────────────────────────────${NC}"
        echo -e "👉 ${YELLOW}cd $WT_PATH${NC}"
        echo -e "${GREEN}═══════════════════════════════════════${NC}"
        ;;
    
    list|ls)
        echo -e "${CYAN}=== Worktrees ===${NC}"
        git worktree list
        ;;
    
    status)
        echo -e "${CYAN}=== 主目录 ===${NC}"
        MAIN_BRANCH=$(git branch --show-current)
        MAIN_DIRTY=$(git status --porcelain | wc -l)
        echo -e "  分支: $MAIN_BRANCH"
        echo -e "  未提交: $MAIN_DIRTY 个文件"
        echo ""
        echo -e "${CYAN}=== Worktrees ===${NC}"
        git worktree list | while IFS= read -r line; do
            path=$(echo "$line" | awk '{print $1}')
            branch=$(echo "$line" | grep -oP '\[.*?\]' | tr -d '[]')
            if [ "$path" = "$REPO_ROOT" ]; then
                echo -e "  ${GREEN}* $path${NC} ($branch) — 主目录"
                continue
            fi
            cd "$path" 2>/dev/null || continue
            dirty=$(git status --porcelain 2>/dev/null | wc -l)
            cd "$REPO_ROOT"
            if [ "$dirty" -gt 0 ]; then
                echo -e "  ${YELLOW}● $path${NC} ($branch) — $dirty 个未提交"
            else
                echo -e "  ${GREEN}○ $path${NC} ($branch) — 干净"
            fi
        done
        ;;
    
    cleanup)
        bash "$(dirname "$0")/session-cleanup.sh" "${1:-}"
        ;;
    
    cleanup-all)
        bash "$(dirname "$0")/session-cleanup.sh" --all-safe
        ;;
    
    help|*)
        echo "gwm-task.sh — 任务生命周期管理（纯 git worktree，无外部依赖）"
        echo ""
        echo "用法:"
        echo "  bash scripts/gwm-task.sh start <task-name>   创建 worktree + 安装依赖"
        echo "  bash scripts/gwm-task.sh list                 列出所有 worktree"
        echo "  bash scripts/gwm-task.sh status               查看全局状态"
        echo "  bash scripts/gwm-task.sh cleanup [path]       清理指定 worktree"
        echo "  bash scripts/gwm-task.sh cleanup-all          清理所有干净 worktree"
        ;;
esac
