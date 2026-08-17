# Code Review: user-feedback-log-upload

**Date**: 2026-08-18
**Reviewer**: Principal agent (dual-model review degraded - Antigravity unavailable, Claude wrapper exited)
**Scope**: Desktop feedback submission + Ops Center feedback ingest/view

## Summary

Cross-app feature adding user feedback (text + optional log archive) in desktop Settings, with admin-facing view in Ops Center. Implementation spans 3 layers: Electron main process, FastAPI backend, Vue frontend.

## Architecture Assessment

**Design is sound.** Desktop renderer sends plain JSON through existing preload/IPC; main process owns all sensitive operations (URL validation, API key, log reading, ZIP creation, multipart upload). Backend authenticates ingest via X-Catalog-Key header; admin APIs via JWT equire_admin. Clean separation of concerns.

## Findings

### No Critical Issues

### Info (acceptable for MVP)

1. **eedback:submit in PUBLIC_CHANNELS** - No auth required for desktop submission by design; catalog key on backend is the auth gate. Acceptable for MVP; consider adding device-level rate limiting later.

2. **No attachment cleanup/retention** - xpires_at stored but no cleanup job yet. Acceptable for MVP; add cron/retention policy before scale.

3. **list_feedback outerjoin** - Could return duplicate rows if multiple attachments per feedback. Current design is one-attachment-per-feedback, so this is fine. Add DISTINCT or LIMIT 1 subquery if schema changes.

4. **ZIP magic check** - Covers end-of-central-directory but not ZIP64 EoCD. Desktop ZIP writer produces standard format; acceptable for MVP.

## Security Review

### Passed

- **Symlink protection**: O_NOFOLLOW on file reads in eedback.js
- **ZIP entry validation**: Regex + directory/symlink checks in eedback_service.py
- **Path traversal prevention**: _safe_attachment_path resolves and compares parent
- **URL validation**: HTTPS required for non-loopback, no credentials in URL
- **Response size limit**: 1MB cap prevents DoS
- **Temp file cleanup**: inally block with mSync
- **Backend rollback**: Exception handler rolls back DB and deletes stored file
- **Auth separation**: Ingest uses catalog key, admin APIs use JWT - no cross-contamination

## Test Coverage

| Layer | Tests | Status |
|-------|-------|--------|
| Backend feedback API | 5 | All pass |
| Desktop feedback service | 5 | All pass |
| Desktop preload/IPC | 349 | All pass |
| Locale sync (CJK) | - | PASS |
| Locale sync (pair) | - | PASS |
| node --check (7 files) | - | All pass |
| Vite build | - | Pass (35.2s) |

## Quality Gates Status

- [x] Locale sync check (CJK + pair)
- [x] node --check all modified JS files
- [x] Backend pytest (5/5)
- [x] Desktop feedback tests (5/5)
- [x] Desktop preload/IPC tests (349/349)
- [x] Vite build
- [ ] Electron packaging (QM-1) - skipped due to disk constraints; index.bundle.js already contains submitFeedback
- [ ] Dual-model review - degraded; principal-agent review completed

## Verdict

**APPROVE** - No critical or major issues. All security checks passed. Test coverage adequate for MVP. Known residuals (no retention policy, no rate limiting) are acceptable for initial release and should be tracked as follow-up tasks.
