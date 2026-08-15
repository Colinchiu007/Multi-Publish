[codeagent-wrapper]
  Backend: claude
  Command: claude -p --dangerously-skip-permissions --setting-sources  --output-format stream-json --verbose -
  PID: 24748
  Log: D:\Temp\codeagent-wrapper-24748.log
  Web UI: http://localhost:65228
  Session-ID: 426dec42-17e7-4dd9-ab9b-c6f67ed84b0a
I have completed my independent audit. Here is the structured report.

---

# Analysis: Story2Video Creation History — Time-Sorted Status Tabs & Detail Interaction

**Scope verified:** baseline `origin/main @ f2cd5161`, branch `codex/story2video-history-status-tabs` (behind main by 1, no feature commits yet). All reads read-only. Tests could **not** be executed (vitest deps absent from `apps/desktop/node_modules`), so the Test Matrix is static-analysis-derived.

---

## Baseline Audit

### Delivered (current behavior that already works)

1. **Two-source merge** — `loadHistory()` merges `story2videoListProjects()` + `pipelineHistory()` and dedups runs that already have a saved project (`CreateView.vue:3733-3752`; duplicated in `usePipelineHistory.js:68-90`).
2. **Stale-running normalization** — runs still `running` with `updatedAt` > 30 min become `paused` with `pausedStage` derived from the running/last stage (`CreateView.vue:3757-3770`; `usePipelineHistory.js:94-107`).
3. **Failed-stage backfill** — `failed` runs get `pausedStage` = failed/non-completed/last stage (`CreateView.vue:3773-3781`; `usePipelineHistory.js:111-119`).
4. **Running refresh** — in-place 5 s polling updates running-run stages without rebuilding the list (`CreateView.vue:3895-3941`).
5. **Resume/delete actions** — explicit buttons with `@click.stop`, idempotent `pipelineResumeOrchestration`, delete via confirmation dialog (`CreateViewHistory.vue:117-147`; `CreateView.vue:3453-3464`, `3841-3877`, `3942-3947`).
6. **Recoverable-project check** — `openHistory` → `/create/result?project=` for completed projects (`CreateView.vue:3832-3833`; `ResultView.vue:319-321`, `586-611`).
7. **Resumability guard** — content-policy/`needs_user_input` failures excluded from resume (`CreateView.vue:3835-3839`; `usePipelineHistory.js:213-217`).

### Pending (gaps vs. the requested change)

| # | Requirement | Current state (evidence) |
|---|---|---|
| P1 | **Sort all visible tasks by effective update time desc (default + every filter)** | **Not met.** History is grouped by status order `[running, projects, paused, failed, other]` (`CreateView.vue:3785-3791`; `usePipelineHistory.js:127-133`); `filteredHistory` preserves that order (`CreateView.vue:1596-1600`; `CreateViewHistory.vue:174-178`). No time sort anywhere. |
| P2 | **Effective time handles 8 field variants + malformed/missing deterministically** | **Partially met.** Display uses only `h.updatedAt \|\| h.completedAt \|\| h.createdAt` (`CreateViewHistory.vue:96,116`) — **`endedAt`/snake_case variants ignored**. For finalized runs (no `updatedAt`/`completedAt`) this shows `createdAt`, not the final-state time. No shared resolver. |
| P3 | **Replace status `<select>` with accessible status tabs** | **Not met.** `<select id="history-status-filter">` (`CreateViewHistory.vue:26-34`) with no `role=tablist`/keyboard pattern. |
| P4 | **Exact status filters — `paused` must NOT include `failed`** | **Not met.** `if (filter === 'paused') return list.filter(i => i.status === 'paused' \|\| i.status === 'failed')` in **3 places**: `CreateView.vue:1598`, `CreateViewHistory.vue:176`, `usePipelineHistory.js:49`. Existing tests encode the wrong behavior (`CreateView.test.js:2875-2895`, `2897-2926`, `2957-2974`). |
| P5 | **Unify card detail + localized pause-stage and failed-stage/error** | **Partially met.** `pausedStage` shown **raw** (`CreateViewHistory.vue:85`), not localized via `getPipelineStage` (already exported in `pipeline-labels.js:211-214`). Failed shows **either** stage **or** error, not both (`CreateViewHistory.vue:87-92`). Meta gate omits `updatedAt`/`endedAt` (`CreateViewHistory.vue:95`). `formatTime`/`formatDuration` hardcoded `zh-CN` (`CreateViewHistory.vue:221-224`, `247-253`). |
| P6 | **Non-cancelled card → detail/read-only/recovery view; cancelled → no navigate** | **Gap.** Card click auto-*resumes* running / resumable-failed / paused-selection runs (`CreateView.vue:3818-3831`) — the exact "accidental resume" the requirement forbids. `paused` non-checkpoint and content-policy-`failed` runs without a projectId fall through to **no-op** (`CreateView.vue:3832`). Cancelled runs currently no-op only because they lack `projectId` (latent risk if one ever has it). |
| P7 | **All user-visible text zh/en pairs** | **Not met for the history card/tabs.** All strings in `CreateViewHistory.vue` are hardcoded Chinese (`加载中...`, `暂无创作记录`, `已暂停`, `从断点继续`, `N 条记录`, etc.). New locale keys must be added **symmetrically** to `zh.js`/`en.js` (enforced by `i18n.test.js:175-198`). |

### Questions (for spec sign-off)

1. **Sort semantics for stale/running runs.** A genuinely running run has only `createdAt` (backend never writes `run.updatedAt` — verified `pipeline-engine.js`; only `_executeStage` stamps `stage.progress.updatedAt`, line 1966). Under a pure time-desc sort, a 2-hour-old running run sinks below newer completed projects, **replacing** today's "running pinned to top" (`CreateView.test.js:3064` asserts `history[0].id === 'run-live'`). Accept? Or use stage `progress.updatedAt` as the running-run effective time (spec lists only the 8 field names — I recommend the pure field chain + note the enhancement)?
2. **Detail target for failed / non-live runs.** There is **no** run-detail route today (`ResultView` requires a `projectId`). Do we add a lightweight read-only detail (modal/expandable panel inside the history list), or route all non-completed cards to the pipeline page in a *read-only attach* state (no resume)? This drives P6 scope.
3. **Whether `paused` tab should also keep showing `pending`/`waiting_approval`** (currently not in the select). Recommend keeping the 6 tabs (all/running/paused/failed/completed/cancelled) and mapping `waiting_approval`/`needs_user_input` into `paused`-tab membership via a *normalized* status — or exact-only? (Exact-only conflicts with the fact that `paused` is the UI bucket for checkpoint waits.)
4. **`CreateHistory.vue` legacy route (`/create/history`, `router/index.js:39`)** still uses `storeListPublishHistory` + its own copy of the same filtering/sorting/`historyStatusLabel` (`CreateHistory.test.js`). In scope or a follow-up? (This audit scopes to the CreateView tab only; recommend follow-up.)
5. **Backend-side sort?** `pipelineHistory` is consumed by both `CreateView.vue` and legacy `CreateHistory.vue`. Recommend **frontend-only** sort (safest, single merged view). Confirm no backend change is wanted.

---

## Data Contract

Sources and the exact timestamp fields each carries (evidence):

| Source | Endpoint → producer | Fields | Effective-time winner |
|---|---|---|---|
| **Story2Video projects** | `story2videoListProjects()` (`publisher.js:349`) → `Story2VideoProjectService.listProjects()` (`story2video-project-service.js:316-321`), saved in `saveRun` (`:430-454`) | `projectId, pipeline, status('completed'), title, createdAt, updatedAt(=now), endedAt(=run.endedAt), duration, videoPath, segments, options, recoverable` | `updatedAt` |
| **Active runs** | `pipelineHistory()` (`publisher.js:312`) → `PipelineEngine.getHistory()` `[...active, ..._history, ...persisted]` (`pipeline-engine.js:944-1002`) | active: `id, pipeline, status(running/paused), currentStage, stages, checkpoint, createdAt, activeMs` — **no updatedAt/endedAt** | `createdAt` (only field) |
| **Finalized memory runs** | same `getHistory()` → `_history` pushed in `_finalizeRun` (`pipeline-engine.js:1859-1867`) | `id, pipeline, status, stages, context, error, createdAt, endedAt(=now), activeMs, projectId?, checkpoint?` | `endedAt` |
| **Persisted snapshots** | same `getHistory()` → `runStateStore.listFailed/listRunning` (`pipeline-engine.js:961-999`) | mapped to `createdAt, updatedAt(=endedAt\|\|createdAt), completedAt(=endedAt), pausedStage, checkpoint, error, activeMs` (`:987-989`) | `updatedAt` |
| **Run-state store file** | `RunStateStore._write` (`run-state-store.js:108-144`) | `runId, pipeline, status, currentStage, stages, context, params, checkpoint, error, createdAt, activeMs, endedAt(running→null)` | n/a (upstream) |

**Effective-time resolver** (new shared util) must evaluate in exactly this order and treat `null`/`undefined`/`''`/`Invalid Date` as missing:
`updatedAt → updated_at → completedAt → completed_at → endedAt → ended_at → createdAt → created_at`. Missing/malformed ⇒ `0` (deterministic bottom of sort). Tiebreak by secondary `createdAt/created_at`, then stable identity (`id`/`projectId`/`runId`). Accept string or epoch-number values; never `new Date(null)` (coerces to epoch 0 — must be guarded).

**Normalization contract** (keep existing): stale `running`→`paused` with `_originalStatus`; failed `pausedStage` backfill; persisted `running`→`paused` (`pipeline-engine.js:972`); `checkpoint` passthrough for `scene_asset_selection` (`:993-995`).

---

## Recommended UX / Interaction

### 1. Status tabs (replaces `<select>`)
Mirror the existing `role="tablist"` pattern already used in this file family (`CreateView.vue:1124-1137` `s2v-batch-tabs`):
```
<div class="history-status-tabs" role="tablist" aria-label="状态筛选">
  <button v-for="tab in statusTabs" :key="tab.value" role="tab"
    :aria-selected="historyFilter === tab.value" :class="['history-status-tab', { active: historyFilter === tab.value }]"
    :id="'history-tab-' + tab.value" :aria-controls="'history-panel-' + tab.value"
    @click="$emit('update:historyFilter', tab.value)">
    {{ tab.label }}
  </button>
</div>
```
Six tabs: `all | running | paused | failed | completed | cancelled`, labels localized. Optionally `@keydown` arrow navigation; minimum is `role=tab` + `aria-selected` (matches existing codebase accessibility bar).

### 2. Filtering & sorting (single shared contract)
- `filterHistoryByStatus(list, 'paused')` ⇒ **exact** `status === 'paused'` only (delete the `|| failed` in all 3 sites).
- `sortHistoryByEffectiveTime(filtered)` applied in **both** the default list and every filtered view, in `loadHistory` and in the `filteredHistory` computed (so live polling re-sorts deterministically).
- Because the status-grouped ordering is removed, `scheduleHistoryRefresh` (which depends on `history` containing running items) still works — it scans `history` for any `running`.

### 3. Card click matrix (prevents accidental resume)
| Status | Card click action |
|---|---|
| `cancelled` | **No navigation.** Add `is-cancelled` class (`cursor: default`), `aria-disabled`, remove `@click` (or early-return in `openHistory`); hide the "打开" button. |
| `completed` + `projectId` | `/create/result?project=…` (unchanged). |
| `completed` no `projectId` | Read-only detail (below). |
| `running` / `paused` / `failed` | **Read-only detail** — do **not** call `pipelineResumeOrchestration`. Best-safest: inline expandable read-only panel (or modal) reusing the card renderers, showing localized status/stage/error/times and embedding the **explicit** resume + delete buttons. |
| (optional recovery attach) | Secondary "查看进度" action on running cards → pipeline page **attach without resume** (`set orchestrationRunId + selectedPipeline + view='pipelines'`, then `updateOrchestrationStatus()` only — never `resumeHistoryItem`). Rejected as default because non-live runs (`getRunContext` ⇒ null) make attach fail. |

Resume/delete stay **explicit buttons** (`@click.stop`, unchanged). `resumeHistoryItem` is now reachable only from buttons.

### 4. Unified card detail
- Time display: use the shared effective-time resolver for the meta row **and** footer (`CreateViewHistory.vue:96,116`).
- `暂停环节：{getPipelineStage(t, h.pausedStage)}` — localized stage name.
- Failed: show **both** `失败环节：{localizedStage}` **and** `错误：{truncatedError}` (fall back to a localized generic error when both empty).
- Localize `formatTime`/`formatDuration` by `currentLocale()`; localize status labels via new `create.history.statuses.*` keys (fixes the latent `failed:'已暂停'` bug in `CreateView.vue:2051` / `create-view-utils.js:34`).

### 5. i18n
Add `create.history.*` to both `zh.js` and `en.js` (structure already has `create:` at `zh.js:86` / `en.js:86`). Keys for: tab labels, empty/loading states, count, running/pause/failed hints, resume/continue/open/delete buttons, duration units. Run `i18n.test.js` symmetry + `glossary.test.js`.

---

## Implementation Plan (safest path)

**Phase 1 — Shared pure util (no behavior change yet).**
New `src/views/history-utils.js`: `HISTORY_TIME_KEYS`, `historyEffectiveTime(item)`, `sortHistoryByEffectiveTime(list)`, `filterHistoryByStatus(list, filter)`, `historyStatusLabel(t,status)`, `historyStageState/Label/Title(stage)`, `formatHistoryTime(iso, locale)`, `formatDurationLocalized(ms, locale)`, `historyItemResumable(item)`. Unit test `history-utils.test.js`. This **centralizes the new logic now** without the risk of adopting the dead `usePipelineHistory.js` composable wholesale.

**Phase 2 — `CreateView.vue` data pipeline.**
- `loadHistory` (`:3785-3791`): replace status-grouped array with `sortHistoryByEffectiveTime([...runs, ...projects])` (normalize first, then sort).
- `filteredHistory` (`:1596-1600`): `sortHistoryByEffectiveTime(filterHistoryByStatus(this.history, this.historyFilter))`.
- Replace inline `formatTime`/`historyStatusLabel` (`:2049-2052`) with shared utils (kills the `failed:'已暂停'` bug).
- `openHistory` (`:3814-3834`): new click matrix — cancelled early-return; completed→result; else read-only detail (never resume). `resumeHistoryItem` (`:3841-3877`) unchanged, button-only.

**Phase 3 — `CreateViewHistory.vue` UI.**
- Tabs markup + `statusTabs` computed; emit `update:historyFilter` on tab click.
- `filteredHistory` (`:174-178`) → exact filter + sort (delete `|| failed`).
- Localize all strings; add `getPipelineStage` import; show localized pause stage + failed stage/error both.
- Time rows → `formatHistoryTime(historyEffectiveTime(h), currentLocale())`.
- Cancelled card → no click + hide 打开; add CSS in `history-panel.css` for `.history-status-tabs`/`.history-status-tab`/`.is-cancelled`.

**Phase 4 — `usePipelineHistory.js` (dead code).**
Apply the same exact-filter + sort to keep it consistent, or delete it in this change (it is imported nowhere — verified; only its own definition matches `usePipelineHistory`). Recommend **defer deletion** to a follow-up, but **fix** `filteredHistory` (`:47-51`) and sorting there too so it can't regress if revived.

**Phase 5 — i18n keys + tests** (below).

**Recommendation on "centralize now":** Centralize the **new** pure logic (sort/filter/effective-time/labels) into `history-utils.js` — yes. Fully migrating `CreateView.vue` onto the `usePipelineHistory` composable — **no**, too risky for a 4436-line critical file; note as follow-up (the composable is already a stale duplicate and should be reconciled, not grown).

---

## Risk Matrix

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Removing "running pinned to top" changes perceived urgency; stale-running tasks sink | Med | Sort by effective time as required; keep the running *pulse* styling + `is-running` class so active tasks remain visually distinct; add a "进行中" badge. |
| R2 | `filteredHistory` exact `paused` breaks 3 existing tests that *assert* paused⊇failed (`CreateView.test.js:2875-2995`) | Med | Update tests to use the `failed` tab; these are intentional behavior changes — call out in PR. |
| R3 | Card click previously resumed; removing resume could strand users who relied on click-to-continue | Med | Keep a prominent explicit "从断点继续/继续生成" button (already present); add a hint on the read-only detail panel. |
| R4 | Malformed timestamps (`new Date(null)` ⇒ epoch, `new Date('junk')` ⇒ NaN) cause nondeterministic order | High | Guard `null/''/undefined`, skip non-finite; tiebreak by `createdAt` then stable id; unit-test the resolver. |
| R5 | `pausedStage` from backend may be a non-registry string; `getPipelineStage` returns raw fallback (ok) | Low | Acceptable; unit-test fallback. |
| R6 | New i18n keys break `i18n.test.js` symmetry if zh/en drift | Med | Add keys in one commit; run `i18n.test.js` + `glossary.test.js` in CI. |
| R7 | Frontend-only sort diverges from any future backend sort | Low | Document contract in the change spec; keep resolver in one shared util. |
| R8 | Test pollution: `vi.clearAllMocks()` keeps leaked `mockResolvedValue` from earlier tests, so `CreateView.test.js:3081` may pass only via leakage | Med | When rewriting history tests, use `mockReset`/`mockRestore` per-test for `pipelineResumeOrchestration`/`pipelineGetRunContext`. |
| R9 | A completed run without a saved project has no detail view today | Med | Covered by the read-only detail panel (Phase 3); no navigation to a broken route. |

---

## Test Matrix (acceptance → tests)

| Acceptance scenario | Test (file · name) |
|---|---|
| **A1** Default list sorted by effective time desc (mix of project/running/finalized/persisted, incl. snake_case) | `history-utils.test.js` · `sortHistoryByEffectiveTime`; `CreateView.test.js` · "默认历史列表按有效更新时间倒序" (assert array order by injected timestamps) |
| **A2** Each status tab also sorted desc | `CreateView.test.js` · "每个状态 tab 内仍按有效时间倒序" |
| **A3** Malformed/missing timestamps ⇒ deterministic bottom + stable tiebreak | `history-utils.test.js` · "malformed/missing → 0, deterministic tiebreak" |
| **A4** Effective-time chain order `updatedAt>…>createdAt` and all 8 variants | `history-utils.test.js` · "field precedence covers 8 variants" |
| **A5** Status tabs render as `role=tablist/tab` with `aria-selected`; click emits `update:historyFilter` | `CreateViewHistory.test.js` (new) · "status tabs render + keyboard/ARIA + emit" |
| **A6** `paused` tab excludes `failed`; `failed` tab exact | `CreateView.test.js` · update "历史记录可按完成和失败状态筛选" → use `failed`; add "paused 精确不含 failed" |
| **A7** Localized pause-stage (`getPipelineStage`) on paused/failed cards | `CreateViewHistory.test.js` · "暂停环节显示本地化阶段名 (zh/en)" |
| **A8** Failed card shows both stage and error | `CreateViewHistory.test.js` · "失败环节与错误同时展示" |
| **A9** Card click on running/paused/failed opens read-only detail, does **not** call `pipelineResumeOrchestration` | `CreateView.test.js` · rewrite "点击运行中历史项…" → assert resume mock **not** called, detail shown |
| **A10** Cancelled card click does not navigate / no 打开 button | `CreateView.test.js` · "已取消卡片不可点击且无打开按钮" |
| **A11** Completed project card → `/create/result?project=` | keep `CreateView.test.js:2851-2873` |
| **A12** Explicit resume button still resumes (failed & running) | keep `CreateView.test.js:2897-2955` (retarget `paused`→`failed` filters) |
| **A13** Content-policy failure still not resumable | keep `CreateView.test.js:2957-2974` (retarget filter) |
| **A14** Delete flow unchanged | keep `CreateView.test.js:3028-3048` |
| **A15** Running refresh in-place update + terminal transition reload | keep `CreateView.test.js:3099-3130` |
| **A16** zh/en locale symmetry for all new `create.history.*` keys + placeholders | `i18n.test.js` (existing symmetry tests); extend `collectPaths` expectation |
| **A17** Backend `getHistory` persisted snapshot fields (regression, unchanged) | keep `pipeline-engine.test.js:151-233` |

---

### Bottom line
The change is **safe if and only if** sorting/filtering/effective-time logic is centralized in one pure, unit-tested util; `openHistory` is decoupled from resume; and the `paused`-includes-`failed` conflation is removed from **all three** filter sites simultaneously. Frontend-only sorting is the lowest-risk choice. Two deliberate behavior changes (running no longer auto-pinned; paused excludes failed) will invalidate 4–6 existing tests — those are spec-mandated and should be updated, not preserved.

---
SESSION_ID: 426dec42-17e7-4dd9-ab9b-c6f67ed84b0a
