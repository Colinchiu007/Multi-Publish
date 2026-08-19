# QM-5 Review: Fix Completed Video History Deletion

Task: fix-video-history-delete-completed
Branch: codex/fix-video-history-delete-completed
Date: 2026-08-20
Risk: Medium
Complexity: M

## Findings

### Critical

None remain after the fix.

### Warning

The Antigravity review backend was unavailable: the account was reported as not eligible in the current location. Claude implementation review completed and its findings were addressed. A final Claude wrapper review was attempted but timed out without producing a report:

- run deletion failure and rejection paths now preserve the card and show the run-specific message key;
- project/run identity collisions now fail closed instead of selecting a project by a stale field;
- ambiguous runId fallback to projectId was removed;
- IPC coverage now includes missing and invalid project IDs.

### Info

The renderer preserves the existing split between project deletion and pipeline run deletion. A failed project delete intentionally does not delete the run as a fallback, because those are separate persisted resources and the OpenSpec contract requires no cross-target deletion after an identity failure.

## QM-5 Root Cause

The previous history merge used run.projectId || run.id to look up a current project. A stale run.projectId was then retained on a completed pipeline history item. requestHistoryDeletion() treated that field as authoritative and invoked story2video:delete-project; Story2VideoProjectService.deleteProject() correctly failed when the ID was not in the current owner's index. The user-facing result was the generic project deletion failure message.

The direct fallback was introduced by commit 6790d6a9, while the project deletion path predates it. The fix validates only runId/id against the current project index, clears unverified projectId values, and routes pure runs to pipeline:delete-run.

## Test Escape Chain

1. Unit/component: tests populated history after normalization and therefore never exercised the bad merge. Success-only mocks also left failure paths untested.
2. Integration/IPC: service and IPC tests covered valid project deletion and auth boundaries, but not a missing project in the current owner index.
3. E2E: history navigation and rendering did not perform the completed-card deletion flow with both project and run stores populated.
4. Visual: visual checks do not validate the IPC target selected by a click.
5. Review: no explicit contract stated that pipeline-provided projectId is not sufficient evidence of project ownership.

## Systemic Gap

This was a cross-layer identity-contract gap at the history normalization boundary, combined with mocks that bypassed that boundary. The UI field name made an unverified value look canonical.

## Regression Protection

- apps/desktop/src/views/CreateView.test.js covers canonical matching, stale and conflicting IDs, completed deletion routing, success/failure/rejection, and login denial.
- apps/desktop/src/views/CreateViewHistory.test.js covers completed project and pure-run delete events.
- apps/desktop/electron/services/story2video-project-service.test.js covers missing-index fail-closed behavior without index mutation.
- apps/desktop/electron/ipc-handlers/story2video.test.js covers missing-project response mapping and invalid-ID rejection.

## Prevention Measures

- OpenSpec states the verified identity contract and the no-cross-target-delete rule in executable scenarios.
- Regression tests begin with real loadHistory() source responses for identity cases instead of only assigning normalized history objects.
- Future review should inspect the data-normalization boundary whenever a renderer field selects a destructive IPC operation.

## Verification Snapshot

- Targeted Vitest: 7 files passed, 490 tests passed.
- git diff --check: passed.
- node scripts/verify-worktree-deps.js: passed.
- scripts/pre-code-edit-guard.ps1: passed.
- Antigravity review: unavailable due to backend eligibility; downgrade recorded above.
- Renderer/preload build: passed.
- electron-builder --win --x64 --publish never: passed.
- Packaged Electron app launch: remained alive for 8 seconds with empty stderr; no ASAR path/config/updater failure signatures observed.
- Worktree health: write guard was running, but the repository baseline reported 64 worktrees outside the configured default root; this pre-existing environment condition kept the aggregate health result non-zero.
- Delivery: pushed branch and opened PR #1037 (https://github.com/Colinchiu007/Multi-Publish/pull/1037); PR is open and awaiting review/merge.
