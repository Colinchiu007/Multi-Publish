## Summary

- Replace the leaked `{sceneText}` placeholder with natural-language scene context.
- Resolve concrete provider names such as MiniMax, Kling, and Agnes Image, with a safe current-model-account fallback.
- Remove raw technical details from Story2Video history failure messages and document the data, display, interaction, and validation contracts.

## Scope

- Story2Video renderer notification normalization and pipeline error formatter.
- zh/en locale copy for rate limits, quota, empty results, API key, provider parameters, asset generation, and scene regeneration failures.
- Regression tests, PRD, OpenSpec, quality-rhythm record, CCG task, and memory.

## Validation

- Focused Vitest: 276 passed.
- Changed-file ESLint: passed.
- `pnpm run build:vue`: passed.
- `node scripts/verify-worktree-deps.js`: passed.
- OpenSpec strict validation: passed.
- Locale pair and CJK checks: passed; baseline remains 1485 entries with no new hardcoded renderer copy.
- `git diff --check`: passed.

## Review Notes

- External antigravity review was unavailable because the account was not eligible in the current location.
- External Claude wrapper exited without an agent report.
- Local quality-rhythm review found 0 Critical and 0 Warning/Major findings; details are in `.ccg/tasks/error-message-fix/review.md`.
- `ResultView.test.js` retains 7 unrelated pre-existing baseline failures around material slots, buttons, and media URLs; the affected error-message assertions were updated separately.
