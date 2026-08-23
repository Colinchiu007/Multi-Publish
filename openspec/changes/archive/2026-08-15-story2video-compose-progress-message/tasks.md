## 1. Regression Tests

- [x] 1.1 Add StageProgress regression for concat block message precedence, percent bar retention, and blank-message fallback.
- [x] 1.2 Add CreateView integration regression for orchestration context to rendered stage detail propagation.

## 2. Renderer Implementation

- [x] 2.1 Make StageProgress consume a trimmed non-empty legacy compose message before phase/percent fallback.
- [x] 2.2 Keep CreateView's duplicate compose detail resolver aligned with the same precedence and fallback rules.

## 3. Documentation and Quality Gates

- [x] 3.1 Update PRD, concat analysis, and pipeline progress plan with the completed renderer contract.
- [x] 3.2 Run targeted tests, locale/CJK gates, visual verification, OpenSpec validation, and double-model review.
- [x] 3.3 Commit, push, open PR, verify CI, and archive OpenSpec/CCG task artifacts after merge.
