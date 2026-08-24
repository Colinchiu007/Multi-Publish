## 1. Specification and test contract

- [x] 1.1 Validate the change with openspec validate s2v-progress-modal-background --strict and correct all format or completeness errors.
- [x] 1.2 Add regression coverage for UiModal overlay and Escape close policies, while preserving the default close behavior for existing dialogs.
- [x] 1.3 Add CreateView regression coverage for the progress modal, explicit background action, close equivalence, checkpoint restrictions, stale responses, and fixed action-bar interactions.

## 2. Modal and renderer implementation

- [x] 2.1 Add opt-in close policy props and lifecycle-safe Escape handling to UiModal.vue; keep existing defaults backward compatible.
- [x] 2.2 Move Story2Video stage progress, warnings, BGM notice, and checkpoint content into the unified progress modal; remove duplicate inline progress rendering.
- [x] 2.3 Add a shared renderer detach-to-background path for the background button and modal close button. It must invalidate polling/request generations, reset the page to the new-task state, show the localized history hint, refresh history, and never call pipelineCancel.
- [x] 2.4 Preserve pause/resume/cancel and scene-asset-selection checkpoint behavior while the modal is open; close the modal only for terminal outcomes or explicit detach.
- [x] 2.5 Apply the same visual modal shell and responsive sizing/scrolling rules to other video pipeline progress surfaces without inventing run-scoped controls where the backend has no stable run identity.

## 3. Localization and documentation

- [x] 3.1 Add all new user-facing strings in Chinese and English locale files as a synchronized pair.
- [x] 3.2 Update the relevant PRD, UX/design documentation, changelog, and learnings with data validation, state transitions, visible controls, modal contents, copy, checkpoint exceptions, and the ordinary-pipeline run-identity limitation.

## 4. Verification and delivery

- [x] 4.1 Run dependency/worktree resolution checks, focused Vitest suites, Vue build, locale/CJK checks, lint/syntax checks, and diff checks.
- [x] 4.2 Perform desktop and narrow-viewport interaction verification for modal scrolling, action-bar clicks, close animation, overlay/Escape behavior, and stale-response isolation.
- [x] 4.3 Run the required parallel opencode and Claude reviews, record the merged findings in .ccg/tasks/s2v-progress-modal-background/review.md, and fix all blocking findings.
- [x] 4.4 Feature PR #1127 was pushed and squash-merged as `19a01746e738dcbd489b3ea8f5de4240d2dcffc0`; all required CI checks passed, `origin/main` was verified to contain the merge, and the OpenSpec/CCG artifacts were moved to their archive paths.
