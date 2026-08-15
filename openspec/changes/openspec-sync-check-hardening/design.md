## Context

See `proposal.md` for motivation. The current checker parses CCG task records and indexes active and archived OpenSpec directories, but it accepts terminal `currentPhase` values when `status` is still non-terminal and accepts a `superseded` exception without requiring evidence. The quality-rhythm integration keeps a separate, older checker template, so fixes can drift between an installed script and the repository implementation.

## Goals / Non-Goals

**Goals:**
- Make completed/archive state consistency machine-checkable.
- Keep malformed metadata separate from normal workflow violations with stable exit codes.
- Make an active change's task-tracking state visible when a linked CCG task claims completion.
- Keep the installer template behaviorally identical to the repository checker.

**Non-Goals:**
- Do not require every active OpenSpec change to be complete.
- Do not infer remote PR state or rewrite task metadata automatically.
- Do not alter product runtime behavior.

## Decisions

### Model terminal state as a bidirectional invariant

`status=completed` and `currentPhase in {completed, archived}` are treated as equivalent terminal signals and must appear together. This catches both early task completion and archived records that retain an in-progress status. We keep terminal phases explicit rather than deriving them from archive directory placement because task records can be audited before physical movement.

Alternative considered: accept either field as terminal. Rejected because that is the source of the drift the checker exists to detect.

### Treat unsupported metadata as an input error

Malformed JSON, invalid change IDs, invalid terminal-state pairs, and `openspecState=superseded` without a non-empty `supersededBy` are input errors (exit `2`). A valid record that violates workflow policy, such as a completed task pointing to an active or missing change, remains a business violation (exit `1`).

Alternative considered: make all findings warnings. Rejected because CI and pre-archive gates need an unambiguous failure class.

### Inspect active-change tasks only through a completed CCG association

When a completed task references an active change, the checker reads that change's `tasks.md`. Missing, untracked, or unchecked work emits an additional violation alongside the active-change violation. Active changes without a completed CCG task are intentionally ignored, since in-progress work is normal.

Alternative considered: scan all active changes for unchecked tasks. Rejected because it would report every legitimate in-progress change.

### Keep the template source synchronized verbatim

The quality-rhythm integration template will carry the same checker implementation as `scripts/openspec-sync-check.js`. Tests exercise the repository copy, while a source-equality assertion prevents behavioral divergence at installation time.

Alternative considered: import the repository script from the template. Rejected because the template must operate after it is copied into an arbitrary target repository.

## Risks / Trade-offs

- [Legacy archived records fail after strict validation] → Repair only the records that violate the explicit invariant, preserving historical fields and unrelated changes.
- [A future workflow adds a terminal phase] → Extend the centralized terminal-phase set and its test matrix in the same change.
- [A change intentionally has no executable tasks] → It must not be attached to a completed CCG task until it is archived or superseded with evidence.

## Migration Plan

1. Add focused fixture tests for each new invariant.
2. Update both checker copies and run the test suite.
3. Correct the identified archived task status fields.
4. Run the checker across the full repository and record the result in the delivery review.

Rollback consists of reverting the checker/template and restoring the affected task metadata together; there is no runtime data migration.
