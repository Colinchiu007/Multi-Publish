#!/usr/bin/env bash
# session-init.sh - audit/recover the shared root; named tasks use D-drive worktrees.
# Usage: bash scripts/session-init.sh [task-name]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CURRENT_ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel)"
PRIMARY_ROOT="$(git -C "$CURRENT_ROOT" worktree list --porcelain | awk '/^worktree / {print substr($0,10); exit}')"

if [ -z "$PRIMARY_ROOT" ]; then
    echo "ERROR: cannot resolve the primary Git worktree" >&2
    exit 1
fi

if [ -n "${1:-}" ]; then
    exec "$BASH" "$SCRIPT_DIR/gwm-task.sh" start "$1"
fi

CURRENT_BRANCH="$(git -C "$PRIMARY_ROOT" branch --show-current)"
MARKER="$PRIMARY_ROOT/.agent_context/shared-root-violation"

sync_main() {
    mkdir -p "$(dirname "$MARKER")"
    if ! git -C "$PRIMARY_ROOT" fetch --prune origin || ! git -C "$PRIMARY_ROOT" merge --ff-only origin/main; then
        printf 'shared root is on main but could not fast-forward from origin/main; resolve remote synchronization before committing\n' > "$MARKER"
        echo "ERROR: shared root main synchronization failed; commit protection remains enabled." >&2
        return 1
    fi
    rm -f "$MARKER"
}

echo "=== session-init: shared root audit ==="
echo "Root:   $PRIMARY_ROOT"
echo "Branch: ${CURRENT_BRANCH:-detached}"

if [ "$CURRENT_BRANCH" = "main" ]; then
    if [ -n "$(git -C "$PRIMARY_ROOT" status --porcelain)" ]; then
        echo "WARNING: shared root is on main but has local changes; leaving them untouched." >&2
        exit 2
    fi
    sync_main || exit 5
    echo "OK: shared root is clean on main"
    exit 0
fi

if [ -z "$CURRENT_BRANCH" ]; then
    echo "ERROR: shared root is detached; finish the active Git operation before recovery." >&2
    exit 3
fi

if [ -n "$(git -C "$PRIMARY_ROOT" status --porcelain)" ]; then
    STASH_NAME="session-init recovery from $CURRENT_BRANCH $(date +%Y-%m-%d_%H%M%S)"
    git -C "$PRIMARY_ROOT" stash push --include-untracked -m "$STASH_NAME"
    echo "Preserved shared-root changes in stash: $STASH_NAME"
fi

if ! git -C "$PRIMARY_ROOT" switch main; then
    mkdir -p "$PRIMARY_ROOT/.agent_context"
    printf 'shared root remains on %s; git switch main failed\n' "$CURRENT_BRANCH" > "$MARKER"
    echo "ERROR: could not restore main. Check whether another worktree holds main." >&2
    exit 4
fi

sync_main || exit 5
echo "OK: shared root restored to current main"
echo "For task work run: bash scripts/session-init.sh <task-name>"
