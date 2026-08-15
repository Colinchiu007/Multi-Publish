#!/bin/bash
# Integration tests for the shared-root post-checkout guard.
set -u

HOOK_SRC="$(cd "$(dirname "$0")" && pwd)/post-checkout"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/ccg-post-checkout-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

new_repo() {
    rm -rf "$TMP/repo" "$TMP/wt" "$TMP/main-holder"
    mkdir -p "$TMP/repo"
    git -C "$TMP/repo" init -q -b main 2>/dev/null || git -C "$TMP/repo" init -q
    if [ "$(git -C "$TMP/repo" branch --show-current)" != "main" ]; then
        git -C "$TMP/repo" symbolic-ref HEAD refs/heads/main
    fi
    git -C "$TMP/repo" config user.email hook-test@example.com
    git -C "$TMP/repo" config user.name "Hook Test"
    git -C "$TMP/repo" config commit.gpgsign false
    echo base > "$TMP/repo/base.txt"
    git -C "$TMP/repo" add base.txt
    git -C "$TMP/repo" commit -q -m base
    cp "$HOOK_SRC" "$TMP/repo/.git/hooks/post-checkout"
    chmod +x "$TMP/repo/.git/hooks/post-checkout" 2>/dev/null || true
}

scenario_clean_root_restores_main() {
    new_repo
    git -C "$TMP/repo" switch -q -c codex/accidental >/dev/null 2>&1 || true
    local branch
    branch="$(git -C "$TMP/repo" branch --show-current)"
    if [ "$branch" = "main" ]; then ok "clean shared root restored main"; else bad "clean root stayed on $branch"; fi
    if [ ! -f "$TMP/repo/.agent_context/shared-root-violation" ]; then ok "clean recovery leaves no marker"; else bad "clean recovery left marker"; fi
}

scenario_dirty_root_fails_closed() {
    new_repo
    echo local > "$TMP/repo/local.tmp"
    git -C "$TMP/repo" switch -q -c codex/dirty >/dev/null 2>&1 || true
    local branch
    branch="$(git -C "$TMP/repo" branch --show-current)"
    if [ "$branch" = "codex/dirty" ]; then ok "dirty shared root is not auto-switched"; else bad "dirty root unexpectedly moved to $branch"; fi
    if [ -f "$TMP/repo/.agent_context/shared-root-violation" ]; then ok "dirty shared root writes marker"; else bad "dirty shared root missing marker"; fi
    if [ "$(cat "$TMP/repo/local.tmp")" = "local" ]; then ok "dirty file preserved"; else bad "dirty file changed"; fi
}

scenario_linked_worktree_is_exempt() {
    new_repo
    git -C "$TMP/repo" worktree add -q -b feature "$TMP/wt"
    git -C "$TMP/wt" switch -q -c feature-next
    local branch
    branch="$(git -C "$TMP/wt" branch --show-current)"
    if [ "$branch" = "feature-next" ]; then ok "linked worktree branch switch allowed"; else bad "linked worktree moved to $branch"; fi
}

scenario_detached_root_restores_main() {
    new_repo
    git -C "$TMP/repo" checkout -q --detach HEAD >/dev/null 2>&1 || true
    if [ "$(git -C "$TMP/repo" branch --show-current)" = "main" ]; then ok "detached shared root restored main"; else bad "shared root stayed detached"; fi
    if [ ! -f "$TMP/repo/.agent_context/shared-root-violation" ]; then ok "detached recovery leaves no marker"; else bad "detached recovery left marker"; fi
}

scenario_main_occupied_writes_marker() {
    new_repo
    CCG_SHARED_ROOT_RECOVERY=1 git -C "$TMP/repo" switch -q -c codex/occupied >/dev/null 2>&1 || true
    git -C "$TMP/repo" worktree add -q "$TMP/main-holder" main
    git -C "$TMP/repo" status --porcelain >/dev/null
    (cd "$TMP/repo" && .git/hooks/post-checkout HEAD HEAD 1 >/dev/null 2>&1) || true
    if [ "$(git -C "$TMP/repo" branch --show-current)" = "codex/occupied" ]; then ok "occupied main prevents auto-switch"; else bad "occupied main unexpectedly switched"; fi
    if [ -f "$TMP/repo/.agent_context/shared-root-violation" ]; then ok "occupied main writes marker"; else bad "occupied main missing marker"; fi
}

scenario_clean_root_restores_main
scenario_dirty_root_fails_closed
scenario_linked_worktree_is_exempt
scenario_detached_root_restores_main
scenario_main_occupied_writes_marker

echo "----"
echo "结果: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
