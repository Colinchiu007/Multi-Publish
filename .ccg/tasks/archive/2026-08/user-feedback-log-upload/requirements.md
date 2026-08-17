# User Feedback And Log Upload

## Goal

Add a user feedback workflow to the desktop Settings > General page. A user can submit a bounded text description and explicitly opt in to attach sanitized application logs. The operations center stores the submission, lets authenticated administrators list and inspect it, and lets them download the attached log archive.

## Scope

- Desktop renderer: feedback textarea, attach-logs checkbox, submit/loading/success/error states, locale pairs.
- Desktop main process: trusted IPC handler, controlled log collection and redaction, multipart POST using existing Ops Center API-key configuration and transport restrictions.
- Ops Center backend: `UserFeedback` plus `FeedbackAttachment` persistence, catalog-key protected ingest, admin-only list/detail/download, bounded input and safe file storage.
- Ops Center frontend: authenticated sidebar menu, route, API wrapper, list/detail drawer, attachment download.
- Focused unit/integration tests for all contracts.

## Non-goals

- Anonymous public feedback without the configured desktop catalog key.
- Operator replies, status editing, or end-user ticket tracking.
- Log archive extraction or server-side execution.
- Exposing API keys, local log paths, raw log contents, or identity access tokens to renderer code.

## Acceptance Criteria

1. Blank/oversized feedback is rejected locally and server-side; duplicate submit clicks create at most one request.
2. `includeLogs=false` sends no local log data; `includeLogs=true` collects only `app-*.log`, rejects symlinks/non-files/oversized inputs, redacts secrets again, and uploads a bounded archive.
3. Desktop transport uses configured Ops Center URL and `X-Catalog-Key`, requires HTTPS except existing loopback allowance, rejects redirects, and never exposes plaintext key to renderer.
4. Backend writes metadata and attachments transactionally enough to avoid orphan files, uses random stored basenames, never extracts archives, and limits request/file/message sizes.
5. Unauthenticated/non-admin operators cannot list, inspect, or download feedback; admin list omits attachment paths and full body until detail.
6. Existing SQLite databases initialize the new tables idempotently through the project's ORM startup path.
7. Desktop settings and operations-center UI have loading, empty, error, success, long-text, and missing-attachment states with zh/en desktop locale pairs.

## Risk Notes

Uploaded logs may contain user content, paths, provider errors, and secrets missed by redaction. The UI must require explicit opt-in, the collector must redact again, and backend responses/logs must avoid content and absolute paths.
