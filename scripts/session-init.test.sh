#!/bin/bash
# Integration tests for session-init.sh and gwm-task.sh.
set -u

SOURCE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/ccg-session-init-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

setup_repo() {
    rm -rf "$TMP/repo" "$TMP/worktrees" "$TMP/origin.git"
    mkdir -p "$TMP/repo" "$TMP/worktrees"
    git -C "$TMP/repo" init -q -b main 2>/dev/null || git -C "$TMP/repo" init -q
    if [ "$(git -C "$TMP/repo" branch --show-current)" != "main" ]; then
        git -C "$TMP/repo" symbolic-ref HEAD refs/heads/main
    fi
    git -C "$TMP/repo" config user.email session-test@example.com
    git -C "$TMP/repo" config user.name "Session Test"
    git -C "$TMP/repo" config commit.gpgsign false
    mkdir -p "$TMP/repo/scripts"
    cp "$SOURCE_ROOT/scripts/session-init.sh" "$TMP/repo/scripts/session-init.sh"
    cp "$SOURCE_ROOT/scripts/gwm-task.sh" "$TMP/repo/scripts/gwm-task.sh"
    echo base > "$TMP/repo/base.txt"
    git -C "$TMP/repo" add .
    git -C "$TMP/repo" commit -q -m base
    git init -q --bare "$TMP/origin.git"
    git -C "$TMP/repo" remote add origin "$TMP/origin.git"
    git -C "$TMP/repo" push -q -u origin main
}

scenario_create_and_reuse() {
    setup_repo
    if ! MP_WORKTREES="$TMP/worktrees" GWM_SKIP_DEPS=1 "$BASH" "$TMP/repo/scripts/session-init.sh" alpha-task >"$TMP/out.log" 2>&1; then
        bad "named task bootstrap failed: $(head -5 "$TMP/out.log")"
        return
    fi
    local path="$TMP/worktrees/mp-alpha-task"
    if [ -d "$path" ]; then ok "named task creates dedicated worktree"; else bad "dedicated worktree missing"; fi
    if [ "$(git -C "$path" branch --show-current)" = "codex/alpha-task" ]; then ok "dedicated branch matches task"; else bad "dedicated branch mismatch"; fi
    if [ "$(git -C "$TMP/repo" branch --show-current)" = "main" ]; then ok "shared root stays on main"; else bad "shared root branch changed"; fi
    local before
    before="$(git -C "$TMP/repo" worktree list --porcelain | grep -c '^worktree ')"
    MP_WORKTREES="$TMP/worktrees" GWM_SKIP_DEPS=1 "$BASH" "$TMP/repo/scripts/session-init.sh" alpha-task >"$TMP/reuse.log" 2>&1
    local after
    after="$(git -C "$TMP/repo" worktree list --porcelain | grep -c '^worktree ')"
    if [ "$before" = "$after" ]; then ok "repeated task bootstrap is idempotent"; else bad "repeated bootstrap created extra worktree"; fi
}

scenario_invalid_name_blocked() {
    setup_repo
    if MP_WORKTREES="$TMP/worktrees" GWM_SKIP_DEPS=1 "$BASH" "$TMP/repo/scripts/session-init.sh" '../escape' >"$TMP/out.log" 2>&1; then
        bad "invalid task name was accepted"
    elif grep -q "kebab-case" "$TMP/out.log"; then
        ok "invalid task name blocked"
    else
        bad "invalid task name diagnostic missing: $(head -5 "$TMP/out.log")"
    fi
}

scenario_wrong_existing_branch_blocked() {
    setup_repo
    git -C "$TMP/repo" worktree add -q -b codex/other "$TMP/worktrees/mp-alpha-task"
    if MP_WORKTREES="$TMP/worktrees" GWM_SKIP_DEPS=1 "$BASH" "$TMP/repo/scripts/session-init.sh" alpha-task >"$TMP/out.log" 2>&1; then
        bad "wrong existing worktree branch was accepted"
    elif grep -q "分支不匹配" "$TMP/out.log"; then
        ok "wrong existing worktree branch blocked"
    else
        bad "wrong branch diagnostic missing: $(head -5 "$TMP/out.log")"
    fi
}

scenario_unrelated_repo_path_blocked() {
    setup_repo
    mkdir -p "$TMP/worktrees/mp-alpha-task"
    git -C "$TMP/worktrees/mp-alpha-task" init -q -b main 2>/dev/null || git -C "$TMP/worktrees/mp-alpha-task" init -q
    if MP_WORKTREES="$TMP/worktrees" GWM_SKIP_DEPS=1 "$BASH" "$TMP/repo/scripts/session-init.sh" alpha-task >"$TMP/out.log" 2>&1; then
        bad "unrelated repository at worktree path was accepted"
    elif grep -q "不属于当前仓库" "$TMP/out.log"; then
        ok "unrelated repository at worktree path blocked"
    else
        bad "unrelated repository diagnostic missing: $(head -5 "$TMP/out.log")"
    fi
}

scenario_sync_failure_writes_marker() {
    setup_repo
    git -C "$TMP/repo" remote set-url origin "$TMP/missing-origin.git"
    if "$BASH" "$TMP/repo/scripts/session-init.sh" >"$TMP/out.log" 2>&1; then
        bad "main synchronization failure was accepted"
    elif [ -f "$TMP/repo/.agent_context/shared-root-violation" ]; then
        ok "main synchronization failure writes marker"
    else
        bad "main synchronization failure missing marker"
    fi
}

scenario_recovery_preserves_dirty_state() {
    setup_repo
    git -C "$TMP/repo" switch -q -c codex/accidental
    echo changed > "$TMP/repo/base.txt"
    echo untracked > "$TMP/repo/local.tmp"
    if ! "$BASH" "$TMP/repo/scripts/session-init.sh" >"$TMP/out.log" 2>&1; then
        bad "dirty recovery failed: $(head -5 "$TMP/out.log")"
        return
    fi
    if [ "$(git -C "$TMP/repo" branch --show-current)" = "main" ]; then ok "dirty recovery restores main"; else bad "dirty recovery branch mismatch"; fi
    if [ -z "$(git -C "$TMP/repo" status --porcelain)" ]; then ok "dirty recovery leaves clean root"; else bad "dirty recovery leaves files"; fi
    if git -C "$TMP/repo" stash list | grep -q "session-init recovery from codex/accidental"; then ok "dirty recovery creates named stash"; else bad "dirty recovery stash missing"; fi
}

scenario_bootstrap_lock_blocks_concurrency() {
    setup_repo
    local common
    common="$(git -C "$TMP/repo" rev-parse --path-format=absolute --git-common-dir)"
    mkdir "$common/ccg-worktree-bootstrap.lock"
    printf '%s\n' "$$" > "$common/ccg-worktree-bootstrap.lock/pid"
    if MP_WORKTREES="$TMP/worktrees" GWM_SKIP_DEPS=1 "$BASH" "$TMP/repo/scripts/session-init.sh" alpha-task >"$TMP/out.log" 2>&1; then
        bad "concurrent bootstrap lock was ignored"
    elif grep -q "正在运行" "$TMP/out.log"; then
        ok "concurrent bootstrap lock blocks second process"
    else
        bad "bootstrap lock diagnostic missing"
    fi
}

scenario_create_and_reuse
scenario_invalid_name_blocked
scenario_wrong_existing_branch_blocked
scenario_unrelated_repo_path_blocked
scenario_sync_failure_writes_marker
scenario_recovery_preserves_dirty_state
scenario_bootstrap_lock_blocks_concurrency

echo "----"
echo "结果: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
