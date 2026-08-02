# Plan

1. Audit every worktree against `main` and identify reachable versus unique commits.
2. Complete `codex/story2video-scope-e2e <- codex/model-provider-key-persistence`, preserving encryption, SQLite persistence and Story2Video behavior.
3. Move ModelProviderManager initialization behind `sqlite-wrapper.ready` and successful `Store.init()` with TDD regression coverage.
4. Update Story2Video E2E fixtures to use a controlled default LLM and preserve a fail-closed no-default case.
5. Run focused tests, real local FFmpeg E2E, Windows packaging, ASAR require and isolated startup checks.
6. Review, commit the resolved branch, merge it into `main`, push, then archive the task and write a memory update.