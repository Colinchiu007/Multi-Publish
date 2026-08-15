## 1. Test Contracts First

- [x] 1.1 Add pure utility tests for candidate time validation, ISO/epoch fallback, missing/invalid dates, deterministic tie-breaks, non-mutating descending sort, and exact status filtering.
- [x] 1.2 Add CreateViewHistory component tests for default all tab, six tab ARIA semantics, mouse/keyboard tab switching, paused/failed separation, stable count rendering, and re-sorting after updated history props.
- [x] 1.3 Add component tests for unified card fields, localized paused environment/checkpoint, simultaneous failed stage and error summary, missing-error fallback, and English locale formatting.
- [x] 1.4 Add interaction tests proving non-cancelled card activation opens read-only detail without resume/write IPC, explicit resume/open-result/delete actions remain available, and cancelled cards are inert and not focusable.

## 2. Shared History Behavior

- [x] 2.1 Implement history-utils.js with the documented time-key contract, strict invalid-value handling, stable descending comparator, exact status filter, and safe display helpers as needed.
- [x] 2.2 Update CreateView.vue history merge/computed logic to use shared sorting/filtering and remove status-group ordering without changing history data-source, polling, stale detection, or recovery behavior.
- [x] 2.3 Update usePipelineHistory.js and any remaining history filtering path to use the same shared utilities, including the paused/failed separation regression.

## 3. History UI and Interaction

- [x] 3.1 Replace the history select with an accessible fixed tablist and roving keyboard focus, preserving the controlled historyFilter event contract.
- [x] 3.2 Refactor history cards around a consistent information skeleton, locale-aware time/duration rendering, status-specific paused and failed details, and safe missing-field fallbacks.
- [x] 3.3 Make non-cancelled card bodies read-only detail triggers; add the detail modal and explicit action wiring with event propagation guards; make cancelled cards inert.
- [x] 3.4 Update history styles for tab labels, stable counts, card focus states, detail modal, responsive fields, and cancelled-card non-interactive presentation.
- [x] 3.5 Add paired create.history.* Chinese and English locale entries and route all new or migrated visible history copy through i18n and pipeline-stage labels.

## 4. Verification and Documentation

- [x] 4.1 Run targeted utility/component tests in RED before implementation and GREEN after implementation; then run the complete desktop renderer test suite and build.
- [x] 4.2 Run locale synchronization/CJK baseline checks and the project OpenSpec/quality-gate validation scripts.
- [x] 4.3 Run Playwright or equivalent visual regression at desktop and narrow viewport sizes, including all tabs, dense cards, paused/failed details, and the read-only modal.
- [x] 4.4 Update 01-docs/PRD-video-creation.md, 01-docs/PRD.md, 01-docs/product-manual.md, 01-docs/CHANGELOG.md, 01-docs/learnings.md, 01-docs/decision-log.md, and 01-docs/i18n-glossary.md with data validation, ordering, filters, interactions, display fields, copy, and rollback details.
- [x] 4.5 Run dual-model review (record Antigravity availability failure and Claude analysis already archived), resolve Critical/Major findings, and update .ccg/tasks/story2video-history-status-tabs/review.md.
- [x] 4.6 Validate and archive the OpenSpec change, update/close the CCG task with remote status, push branch, create PR, wait for CI, merge PR, and verify the merged remote commit before final archive.
