# Implementation Plan

1. Verify the loading-state regression with focused component/service tests and reproduce the current provider GUI fixture failure.
2. Bound the renderer IPC requests and prevent external persisted video paths from synchronously blocking the main process.
3. Align E2E provider fixtures with the `is_configured` IPC contract so GUI CI tests exercise the actual configured-provider view.
4. Run focused, E2E, build, Electron package, ASAR, require-chain and isolated startup validation.
5. Run code review, update the bug-reflection record, commit the minimal named paths, push a PR, and merge only after CI is green.

6. Extend the identical timeout/error contract to the standalone CreateHistory view after the mode scan found it awaited the same history IPC without a deadline.
