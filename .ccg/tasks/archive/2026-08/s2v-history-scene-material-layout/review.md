# CCG Review: Story2Video Scene Material Layout

Date: 2026-08-20
Branch: codex/s2v-scene-material-layout
Worktree: D:/Data/projects/mp-worktrees/mp-s2v-scene-material-layout

## Scope

- Move each material radio control below its media frame and keep the material label after the radio.
- Make thumbnail activation preview-only; selection is radio-only.
- Keep four visual cards in a stable order: image1, image2, video1, video2.
- Put scene-level generation actions in their owning cards, enlarge the preview modal, and make empty states geometrically consistent.
- Preserve the canonical persisted selection contract: image1 | image2 | video.

## Verification

- Focused Vitest: ResultView.test.js and views-deep2.test.js, 105 passed.
- ESLint: changed renderer, test, and locale files passed with exit 0.
- Vue build: pnpm run build:vue passed with exit 0. Existing Vite chunk-size and dynamic-import warnings only.
- Workspace dependency resolution: node scripts/verify-worktree-deps.js passed.
- Locale/CJK gate: node .github/scripts/check-locale-sync.js --cjk passed, baseline/current 1491 entries.
- OpenSpec: pnpm exec openspec validate s2v-history-scene-material-layout --strict passed.
- Diff hygiene: git diff --check passed.
- Generated preload output was restored and is absent from the final feature diff.

## Local Review

Two independent local reviews confirmed:

- Thumbnail and radio event boundaries are separate; thumbnail clicks do not invoke selection IPC.
- Video selection is normalized to canonical video; videoPath is required for a selectable video, while legacy videoMeta paths may still preview.
- Empty cards keep a fixed media frame and expose one localized empty-state string.
- Generation controls occur exactly once in image1 and video1, with busy and prompt guards preserved.
- The stale three-slot scenario wording was corrected to describe four visual cards and three persisted identities.

No Critical or Major findings remain.

## External Model Review

### Antigravity

Unavailable. The wrapper returned an eligibility failure because Antigravity is not available in the current location. This is recorded as an environment degradation; no Antigravity report was produced.

### Claude

Final verdict: PASS, 0 Critical findings.

- Warning W1: the save-and-refresh media URL test used one URL for all paths. Resolved by changing the mock to return a path-derived URL and asserting distinct image1/image2/video URLs.
- Warning W2: refreshSceneMaterialUrls currently resolves the first alternate image only. This matches the existing renderer/service contract (alternateImages[0]) and is retained as a future maintenance note rather than expanding scope.
- Info: locale pairing, event isolation, canonical video persistence, empty-state handling, and button ownership were all confirmed.

## Environment Note

pre-code-edit-guard.ps1 passed and the write-guard watcher was running. The repository health command with RequireWriteGuard reported an existing baseline failure caused by unrelated outside worktrees and quarantine violations (982 quarantined items / 988 violations). No unrelated worktrees or quarantine contents were changed.

## Conclusion

The implementation was committed and merged through PR #1041 with squash merge SHA c6ad1655e2374e0f1acc010b404d4dcd8836e24b. OpenSpec and CCG task archives are complete on the closure branch; repository-level CI exceptions are recorded in .quality-gates.md and the task metadata.
