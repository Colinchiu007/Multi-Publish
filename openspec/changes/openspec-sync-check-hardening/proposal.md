## Why

`scripts/openspec-sync-check.js` currently detects only one direction of CCG/OpenSpec drift: a completed task still pointing to an active change. A repository audit found archived task records whose `currentPhase` is terminal while `status` remains `in_progress`; a malformed supersession record can also silently exempt a missing change. The checker needs to make the archive contract enforceable before the next Round3 delivery is closed.

## What Changes

- Enforce CCG task terminal state consistency in both directions: `status=completed` requires a terminal phase, and a terminal phase requires `status=completed`.
- Require non-empty `supersededBy` evidence whenever `openspecState=superseded` is used to exempt a missing archived change.
- For a completed task linked to an active change, inspect that change's `tasks.md` and report incomplete or missing task tracking explicitly before the existing archive violation.
- Keep the quality-rhythm installer template aligned with the repository checker, add focused Node tests, and repair the discovered archived task metadata.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `openspec-integration`: Strengthen the automated three-way archive synchronization check and its task-state evidence requirements.

## Impact

- Affected workflow tooling: `scripts/openspec-sync-check.js`, its Node test suite, and `.quality-rhythm/integrations/openspec/openspec-sync-check.js`.
- Affected process records: archived `.ccg/tasks/**/task.json` entries with terminal phase/status drift.
- No product runtime API, dependency, or user-facing behavior changes.
