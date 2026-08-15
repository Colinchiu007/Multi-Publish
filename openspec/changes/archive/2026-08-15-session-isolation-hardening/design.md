## Context

See `proposal.md` for the incident motivation. Git binds `HEAD` to a worktree, not to a Codex task. The shared root therefore cannot provide branch isolation to multiple tasks. Existing protection is concentrated in `pre-commit`, which is too late to prevent branch visibility changes. Git has no pre-checkout hook; `post-checkout` runs only after a successful checkout.

The repository already has a D-drive worktree convention, safe worktree removal, a shared hook installer, and temporary-repository integration tests. The implementation should extend those mechanisms rather than introduce a second worktree manager.

## Goals / Non-Goals

**Goals:**

- Reserve the shared root for `main` and coordination.
- Give task bootstrap a deterministic, idempotent dedicated-worktree path.
- Detect an accidental shared-root checkout immediately and restore `main` when safe.
- Preserve every class of local Git state and provide deterministic diagnostics.
- Cover the behavior in disposable repositories and linked worktrees.

**Non-Goals:**

- Replacing Codex's task database or changing the Codex desktop application's global worktree location.
- Automatically merging, deleting, or rebasing feature branches.
- Migrating several active tasks from the same source directory concurrently.
- Treating a non-zero `post-checkout` exit as if Git had undone the checkout.

## Decisions

### 1. The shared root is a coordination directory, not a task workspace

`session-init.sh <task-name>` will create or reuse `D:/Data/projects/mp-worktrees/mp-<task-name>` and print the exact next directory. A no-argument invocation will only audit/recover the shared root. It will not silently turn the shared root into a feature workspace.

Alternative considered: allow one feature task to own the shared root using `session.json`. Rejected because every other task that opens the saved project still sees the owner's `HEAD`, and PID ownership cannot isolate Git state.

### 2. Use post-checkout for detection and recursion-safe restoration

A versioned `post-checkout` hook will compare the absolute top-level path with the primary worktree path resolved from `git worktree list --porcelain`. In the primary root only, a named non-`main` checkout triggers a nested `git switch main` guarded by an environment recursion flag.

If restoration fails, the hook writes `.agent_context/shared-root-violation` and exits non-zero with exact recovery instructions. `pre-commit` will reject commits while this marker exists. A successful restoration removes the marker.

Alternative considered: return non-zero without restoring. Rejected because `post-checkout` cannot cancel the checkout, leaving every shared task on the wrong branch.

Alternative considered: Git aliases that replace `checkout` and `switch`. Rejected because aliases cannot override built-in commands and external tools may invoke Git directly.

### 3. Keep recovery state-preserving and serial

The shared-root recovery command will inspect status first. Dirty or untracked state is placed in a unique named stash only when recovery is explicitly requested; otherwise it refuses. Existing stashes are never popped or rewritten. Migration documentation requires one task at a time because a shared source has one index, one `HEAD`, and one stash namespace.

### 4. Test hooks in disposable repositories

Extend the existing shell integration-test pattern. Tests create a primary repository and linked worktree, install versioned hooks, and assert branch, marker, status, and exit behavior. Tests cover successful restoration, restoration failure, linked-worktree exemption, recursion prevention, and existing pre-commit behavior.

## Risks / Trade-offs

- [Nested Git from `post-checkout` behaves differently on some Git versions] -> Test with the repository's Windows Git and keep fail-closed marker behavior as the fallback.
- [A branch named `main` is already checked out elsewhere] -> Session recovery uses the safe worktree removal process; hook restoration fails closed and never force-removes another worktree.
- [Untracked files conflict with `main`] -> Refuse or preserve them in a named stash; never run clean/reset.
- [Tools ignore hook failures] -> The branch is restored when possible, and the persistent marker is also enforced by pre-commit.
- [Codex-created C-drive worktrees remain possible] -> Repository bootstrap always emits D-drive paths; desktop-project settings are a separate product configuration outside this change.

## Migration Plan

1. Pause Git writes in tasks bound to the shared root.
2. Preserve shared-root local state in a named stash.
3. Safely release any stale worktree holding `main`.
4. Restore and fast-forward the shared root to `origin/main`.
5. Install the updated versioned hooks once in the shared Git common directory.
6. Resume runtime-changing tasks one at a time in dedicated D-drive worktrees.
7. Roll back by reinstalling the prior hook versions; leave recovery stashes untouched.
