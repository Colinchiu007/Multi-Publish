# Session Isolation Hardening

## Gate Assessment

- Change type: tooling/configuration and Git workflow hardening.
- Scale: M (session bootstrap, worktree lifecycle, Git hooks, integration tests).
- Risk: medium because the change affects every contributor's branch and checkout workflow.
- Phase: planning; implementation requires OpenSpec apply.

## Incident Evidence

- Multiple Codex tasks used `D:/Data/projects/Multi-Publish` as the same cwd.
- Task `01a000cf-d579-7722-8abf-2d98de957e6b` ran `git checkout -B codex/fix-s2v-v3 origin/main` at 2026-08-15 10:04:54 +08:00.
- All tasks sharing that cwd immediately observed the same HEAD.
- The pre-commit guard blocked later commits but could not prevent the checkout itself.
- Concurrent Codex handoff attempts failed while competing for the same source stash/checkout state.

## Required Outcome

1. The shared repository root remains on `main`.
2. Code-changing tasks start in `D:/Data/projects/mp-worktrees/mp-<task-name>` on a dedicated `codex/<task-name>` branch.
3. Session bootstrap is idempotent and never silently discards dirty or untracked files.
4. A mistaken branch switch in the shared root is detected immediately and produces a deterministic recovery path.
5. Linked worktrees, rebase replay, detached CI checkouts, and docs-only work on `main` continue to work.
6. Hook installation and behavior are covered by isolated integration tests.

## Current Recovery State

- The stale clean worktree that held `main` was removed with `scripts/safe-worktree-remove.ps1`.
- The four untracked `.tmp-*.js` files were preserved in stash `shared-main-recovery-temp-files-20260815`.
- `D:/Data/projects/Multi-Publish` is clean and fast-forwarded to `origin/main` at `82f7c791`.
- Permanent script/hook changes are implemented in the isolated worktree and are under verification/review.

## External Analysis Availability

- antigravity: unavailable because the account is not eligible in the current region.
- Claude: process started but returned no output after several minutes and was terminated.
- Fallback evidence: Git reflog/session log, official Git hook semantics, repository integration tests, and local isolated test repositories.
