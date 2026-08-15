## Purpose

Defines the observable safety contract that keeps concurrent agent tasks in independent Git worktrees while reserving the shared repository root for current `main` coordination only.

## ADDED Requirements

### Requirement: Shared root remains on main
The shared repository root SHALL remain attached to the local `main` branch and SHALL NOT be used as the working directory for runtime-changing tasks.

#### Scenario: Task attempts a feature checkout in the shared root
- **WHEN** a successful checkout or switch leaves the shared repository root on a named branch other than `main`
- **THEN** the repository SHALL immediately detect the violation and attempt recursion-safe restoration to `main`

#### Scenario: Automatic restoration cannot complete
- **WHEN** the shared root cannot restore `main` because the branch is occupied, Git state is unsafe, or another Git operation prevents recovery
- **THEN** the repository SHALL emit a fail-closed diagnostic, persist an incident marker, and block commits until an operator completes the documented recovery

### Requirement: Runtime-changing tasks use dedicated worktrees
Every runtime-changing task SHALL use a dedicated linked worktree under `D:/Data/projects/mp-worktrees/mp-<task-name>` and a dedicated `codex/<task-name>` branch.

#### Scenario: New runtime-changing task starts
- **WHEN** a task name is passed to the session bootstrap command
- **THEN** the command SHALL create or reuse the exact dedicated worktree and report its absolute path and branch

#### Scenario: Existing matching worktree is reused
- **WHEN** the requested worktree already exists with the expected branch
- **THEN** bootstrap SHALL be idempotent and SHALL return the existing worktree without creating another branch or moving shared-root state

#### Scenario: Existing path has the wrong branch
- **WHEN** the requested worktree path exists but is registered to a different branch
- **THEN** bootstrap SHALL stop with a diagnostic and SHALL NOT switch that worktree or overwrite its files

### Requirement: Recovery preserves local state
Session bootstrap and shared-root recovery SHALL preserve dirty tracked files, staged files, untracked files, and existing stashes.

#### Scenario: Shared root contains local files during recovery
- **WHEN** recovery finds dirty or untracked files in the shared root
- **THEN** recovery SHALL either preserve them in a uniquely named stash and report the stash reference or refuse to continue; it SHALL NOT clean, reset, or overwrite them

#### Scenario: Recovery completes
- **WHEN** the shared root is successfully restored
- **THEN** it SHALL be on an up-to-date `main`, have no new uncommitted changes, and retain all pre-existing stashes plus any explicitly created recovery stash

### Requirement: Git workflow compatibility
Isolation guards SHALL distinguish the shared root from linked worktrees and SHALL preserve supported rebase and detached-checkout workflows.

#### Scenario: Feature branch switch in linked worktree
- **WHEN** a linked worktree switches between named branches
- **THEN** the shared-root restoration guard SHALL not run for that worktree

#### Scenario: Rebase replay or detached CI checkout
- **WHEN** Git is replaying a rebase or a non-shared worktree is detached for CI or verification
- **THEN** the guard SHALL not force `main` or corrupt the Git operation

### Requirement: Existing shared sessions migrate serially
Migration of multiple tasks away from one shared source directory SHALL be serialized.

#### Scenario: Multiple tasks require migration
- **WHEN** more than one active task is bound to the same shared source directory
- **THEN** operators SHALL pause Git writes and migrate one task at a time so stash and checkout operations never run concurrently against the source
