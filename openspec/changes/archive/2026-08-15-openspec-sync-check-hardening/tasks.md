## 1. Regression Coverage

- [x] 1.1 Extend `scripts/openspec-sync-check.test.js` for terminal state bidirectionality and supersession evidence.
- [x] 1.2 Add fixture coverage for missing, untracked, and incomplete active change task files.
- [x] 1.3 Assert the quality-rhythm checker template stays byte-for-byte aligned with the repository checker.

Evidence: `scripts/openspec-sync-check.test.js` covers the completed/archived state matrix, supersession targets, missing task files, untracked changes, incomplete tasks, and byte-for-byte template parity. Fresh command: `node --test scripts/openspec-sync-check.test.js` (16 passing tests).

## 2. Checker Hardening

- [x] 2.1 Enforce terminal `status`/`currentPhase` consistency and valid `supersededBy` evidence in `scripts/openspec-sync-check.js`.
- [x] 2.2 Report active-change task tracking drift only when a linked CCG task claims completion.
- [x] 2.3 Synchronize `.quality-rhythm/integrations/openspec/openspec-sync-check.js` with the repository checker.

Evidence: `scripts/openspec-sync-check.js` validates terminal-state alignment and supersession evidence; `.quality-rhythm/integrations/openspec/openspec-sync-check.js` is kept identical and asserted by the regression suite. Fresh command: `node scripts/openspec-sync-check.js --json` (`ok: true`).

## 3. Historical Repair and Verification

- [x] 3.1 Correct archived task records whose terminal phase still uses a non-terminal status.
- [x] 3.2 Run `node --test scripts/openspec-sync-check.test.js` and `node scripts/openspec-sync-check.js --json`.
- [x] 3.3 Run `openspec validate openspec-sync-check-hardening --strict` and record the evidence in the delivery review.

Evidence: corrected records live in `.ccg/tasks/archive/2026-08/*/task.json`; the suite and JSON checker both pass; `openspec validate openspec-sync-check-hardening --strict` returns valid. The delivery review will record the final fresh run before merge.
