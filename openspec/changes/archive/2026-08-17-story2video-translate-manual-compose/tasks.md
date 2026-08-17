# Tasks

## 1. Contract and implementation

- [x] 1.1 Change manual optimize translation from synchronous call to JSON-safe pending state.
- [x] 1.2 Verify manual candidate generation/checkpoint tolerates missing prompt translations without changing selection data.
- [x] 1.3 Reuse compose parallel hook to translate manual pending state and patch final scenes by index.

## 2. Regression protection

- [x] 2.1 Update manual optimize timing test to assert no early LLM call.
- [x] 2.2 Add manual candidate checkpoint and compose overlap/preservation coverage.
- [x] 2.3 Cover English locale, failure/timeout, resume, and completed-result reuse behavior.

## 3. Documentation and delivery

- [x] 3.1 Update PRD, OpenSpec base spec, CHANGELOG, and learnings with manual-mode behavior.
- [x] 3.2 Run focused tests, build/package gates, and code review.
- [ ] 3.3 Push branch, open and merge PR, archive OpenSpec/CCG task, and update memory.
