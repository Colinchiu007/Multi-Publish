## Why

Multiple Codex tasks can currently open the same shared repository root. A single `git checkout` in that root changes the shared `HEAD` for every task, while the existing pre-commit guard detects the problem only when somebody later commits. The incident on 2026-08-15 showed that this delayed protection is insufficient and that concurrent handoff attempts can themselves contend on the shared stash and checkout state.

## What Changes

- Make the shared repository root a `main`-only coordination directory.
- Make task startup create or reuse a dedicated D-drive worktree and report the exact directory and branch that the task must use.
- Add immediate post-checkout detection for a non-`main` branch in the shared root, with recursion-safe recovery or a fail-closed diagnostic when automatic recovery is unsafe.
- Preserve dirty and untracked files through named stashes or explicit refusal; never silently clean or overwrite them.
- Install and test all versioned Git hooks through the existing shared-hook installer.
- Document the supported migration path for already-running tasks and the limitation that multiple handoffs from one shared source must be serialized.

## Capabilities

### New Capabilities

- `session-worktree-isolation`: Defines main-root invariants, dedicated task worktrees, checkout detection, safe recovery, and migration behavior for concurrent agent sessions.

### Modified Capabilities

- `openspec-integration`: Extends the layered branch strategy so runtime-changing tasks must start in an isolated worktree instead of merely using a feature branch in a shared directory.

## Impact

- Affected tooling: `scripts/session-init.sh`, `scripts/gwm-task.sh`, `scripts/session-guard.ps1`, `scripts/install-git-hooks.ps1`, and versioned Git hooks under `scripts/hooks/`.
- Affected tests: shell integration tests using temporary repositories and linked worktrees.
- Affected workflow: Codex and other agent sessions that currently open `D:/Data/projects/Multi-Publish` directly.
- No product runtime, API, database, auth, or Electron behavior changes.
