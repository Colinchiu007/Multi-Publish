# Calendar Today CI Flake Review

## Scope

- `apps/desktop/src/views/Calendar.vue`
- `apps/desktop/src/views/Calendar.test.js`
- `01-docs/learnings.md`

## Review Result

- Critical: none.
- Warning: none after the final strict input-format review.
- External-model waiver: the user explicitly requested not to use Antigravity or Claude. This task used local, independent read-only reviewers instead.

## Resolved Findings

1. UTC ISO timestamps, local `datetime-local` values, and calendar-cell keys now use one local-date-key contract.
2. Events sort by parsed timestamps rather than their original strings.
3. Date input now accepts only validated `YYYY-MM-DD`, `datetime-local`, and RFC3339 timestamp formats. Unsupported or impossible input is rejected before native `Date` can normalize it into another day.
4. Calendar tests freeze `Asia/Shanghai` and the system clock, restore both after each case, and cover local midnight, UTC boundaries, mixed-format ordering, and rejected bad records.

## Validation

- `npx vitest run src/views/Calendar.test.js --maxWorkers=1 --no-file-parallelism`: 1 file, 19 tests passed.
- `npm run test -w @multi-publish/desktop -- --maxWorkers=1 --no-file-parallelism --reporter=verbose`: 335 files, 5842 tests passed.
- `npx eslint src/views/Calendar.vue src/views/Calendar.test.js`: passed.
- `npm run build:vue`: passed, 1830 modules transformed.
- Calendar target coverage: Statements 92.10%, Branches 76.47%, Functions 92.00%, Lines 93.38%.
- `TEST_URL=http://127.0.0.1:5187 node tests/visual-testing/views/all-views.visual.test.js --single calendar`: passed.
- `git diff --check`: passed.

## Test Environment Note

The first full-suite run exposed stale shared worktree dependencies: `@multi-publish/ai-writer` resolved from the main worktree while this test directly loaded the isolated worktree, and the declared `ffmpeg-ffprobe-static` package was absent from the older shared install tree. A temporary, Git-ignored local junction overlay pointed workspace packages at this worktree and used an asset whose FFmpeg SHA-256 matched `media-tools-lock.json`. The two previously failing files then passed 25/25, and the complete suite passed. No product dependency metadata or source was changed for this environment repair.
