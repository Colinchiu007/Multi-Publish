## 1. Regression Tests First

- [x] 1.1 Extend the disposable-repository hook tests to reproduce a shared-root switch to a feature branch and assert immediate restoration to `main` (`scripts/hooks/post-checkout.test.sh`).
- [x] 1.2 Add tests for restoration failure and the persistent violation marker, including pre-commit rejection while the marker exists.
- [x] 1.3 Add linked-worktree, rebase/detached, recursion-lock, wrong-existing-branch, and idempotent bootstrap scenarios.

## 2. Isolation Implementation

- [x] 2.1 Implement and version the recursion-safe `post-checkout` shared-root guard.
- [x] 2.2 Update `pre-commit` to fail closed when a shared-root violation marker exists while preserving existing rebase and linked-worktree behavior.
- [x] 2.3 Refactor `session-init.sh` and `gwm-task.sh` so named runtime tasks create/reuse only D-drive dedicated worktrees and never silently switch the shared root to a feature branch.
- [x] 2.4 Update the hook installer and session guard diagnostics to describe the main-only shared-root contract and serial migration requirement.

## 3. Verification And Documentation

- [x] 3.1 Run all Git-hook/session integration tests with Windows Git Bash and verify the actual shared hook installation path.
- [x] 3.2 Run `openspec validate session-isolation-hardening --strict` and map every spec scenario to a test assertion.
- [x] 3.3 Update `AGENTS.md`/workflow documentation and `01-docs/learnings.md` with the incident, handoff serialization boundary, recovery stash reference, and rollback procedure.
- [x] 3.4 Complete external-model review when available; otherwise record antigravity/Claude availability failures and perform repository-local review plus clean-diff verification.

## 4. Delivery And Archive

- [x] 4.1 Commit and push `codex/session-isolation-hardening`, create a PR, and record CI/merge status.
- [x] 4.2 After merge, archive the OpenSpec change and CCG task, run `scripts/openspec-sync-check.js`, and commit the three-way archive sync.
