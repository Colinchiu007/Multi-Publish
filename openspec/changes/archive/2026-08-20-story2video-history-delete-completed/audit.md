# Audit Report: Video History Deletion Failure in the Completed List

Branch: codex/fix-video-history-delete-completed
Date: 2026-08-20
Risk: Medium
Complexity: M
Status: Fixed in the working tree; targeted regression suite passed.

## Root Cause

The history page merges two stores:

- story2video:list-projects returns the current owner's persisted projects, keyed by projectId.
- pipeline:history returns execution snapshots, keyed by id or legacy runId.

The previous merge used run.projectId || run.id as the project lookup key. A stale or foreign run.projectId could therefore be copied into a history item even though that ID was absent from the current owner's project index. Clicking delete saw the truthy projectId and selected the project-delete IPC. The project service correctly rejected the missing current-owner project, and the renderer showed the generic story2video.project_delete_failed message.

The call chain was:

1. CreateView.loadHistory() merged a stale run.projectId into the displayed item.
2. CreateView.requestHistoryDeletion() routed any truthy item.projectId to project deletion.
3. story2video:delete-project called Story2VideoProjectService.deleteProject().
4. The service did not find that ID in the current owner's index and threw Story2Video 项目不存在.
5. The renderer displayed “项目未能删除，请稍后再试。” and kept the item visible.

The direct fallback was introduced by the history merge change in 6790d6a9 (feat(story2video): unify pipeline page UX), which replaced the earlier run.id-only filtering with run.projectId || run.id. The project deletion path itself predates that merge change.

## Fix

CreateView.loadHistory() now treats a run as a project only when runId or id explicitly matches exactly one project in the current project index. A stale, missing, or conflicting run.projectId is cleared from the normalized history item, which then follows pipeline:delete-run using its verified run identity.

Project deletion and run deletion remain separate operations. A failed project delete does not fall back to run deletion, because the project and run are different persisted resources and the existing contract requires fail-closed behavior. Both failure and rejected-IPC paths preserve the history card and use stable localized message keys. Both confirmations pass through the existing login gate.

## QM-5 Escape Analysis

| Layer | Why it did not catch the bug |
| --- | --- |
| Unit/component | Existing deletion tests manually assigned w.vm.history with a projectId, bypassing the loadHistory() merge boundary. They mostly mocked successful deletion. |
| Integration/IPC | IPC tests exercised authorization and successful service calls, but not a project ID missing from the current owner's index. Service tests covered successful deletion, not this fail-closed lookup. |
| E2E | Existing history flows covered rendering and navigation, but did not execute completed-card deletion through both data sources and the real deletion branch. |
| Visual regression | Screenshots can prove that a completed card and delete control render, but cannot prove that the normalized identity selects the correct IPC route. |
| Code review | The merge was reviewed as a UI/history consolidation without an explicit cross-layer identity contract. The projectId field looked authoritative even though it came from an untrusted pipeline snapshot. |

The systemic gap was a missing identity contract at the renderer data-normalization boundary, amplified by over-mocked tests that started after normalization. The new tests exercise the boundary, the completed-card event, both deletion routes, failure retention, login gating, service index behavior, and IPC error mapping.

## Regression Coverage

- CreateView.test.js: canonical project matching, stale project IDs, conflicting IDs, successful project/run deletion, failed and rejected deletion calls, and login-gate denial.
- CreateViewHistory.test.js: completed project and pure-run cards emit delete-history.
- story2video-project-service.test.js: missing current-owner project fails without changing the index.
- story2video.test.js: missing project errors are returned and invalid IDs are rejected before service access.

## Prevention

The identity rules and fail-closed deletion contract are recorded in the OpenSpec scenarios under specs/story2video-history-browsing/spec.md and specs/story2video-history-error-messages/spec.md. The completed tasks and CCG review record require future changes to test the merge boundary rather than only injecting normalized history state.

## Review Note

Claude completed the implementation review and its findings were addressed. The required Antigravity review was attempted, but the backend reported that the account is not eligible in the current location. This downgrade is recorded in .ccg/tasks/fix-video-history-delete-completed/review.md.
