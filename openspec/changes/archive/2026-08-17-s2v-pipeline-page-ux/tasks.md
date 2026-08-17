## 1. Specification and terminology

- [x] 1.1 Complete baseline audit for CreateView, history cards, ResultView, pipeline IPC and existing locale keys.
- [x] 1.2 Define “流水线启动页” and “视频任务编辑页” terminology and route behavior.
- [x] 1.3 Record data display, validation, error mapping and navigation contracts in this change and PRD.

## 2. Renderer implementation

- [x] 2.1 Add fixed launch-page action bar and sticky running progress area; preserve sidebar and narrow-screen safe areas.
- [x] 2.2 Unify history-card structure, common fields, status-specific fields, natural-language failure reason and delete/edit actions.
- [x] 2.3 Route history detail/edit actions to ResultView and redirect the legacy history route.
- [x] 2.4 Add ResultView title, history return, segment jump controls and fixed bottom save/recompose actions.
- [x] 2.5 Move AI video generation to scene materials, remove duplicate prompt action/retry buttons, and support no-video editing.
- [x] 2.6 Replace voice ID presentation with catalog-backed select plus text fallback; replace speed input with range control.

## 3. Main-process contracts and tests

- [x] 3.1 Add pause/delete IPC exposure and preload/API bridge methods.
- [x] 3.2 Make pause/resume/delete validation reject malformed stages and preserve state on persistence failure.
- [x] 3.3 Add renderer, IPC and pipeline-engine regression tests for action bars, history interactions and state rollback.

## 4. Documentation and delivery

- [x] 4.1 Update PRD, video-creation PRD, changelog, glossary and learnings with the detailed contracts.
- [x] 4.2 Run locale, lint, dependency, packaging and Electron smoke gates; record exact results in CCG review.
- [x] 4.3 Complete dual-model review or record backend downgrade, then push branch, open/merge PR and verify remote state.
- [x] 4.4 Archive OpenSpec and CCG task after merged delivery.
