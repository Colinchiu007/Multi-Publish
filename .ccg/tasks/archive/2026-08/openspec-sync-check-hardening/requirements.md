# Requirements — OpenSpec sync checker hardening

- Enforce bidirectional terminal task state consistency.
- Require explicit replacement evidence for superseded changes.
- Report active-change task tracking drift for completed CCG tasks.
- Keep the quality-rhythm template byte-aligned with the repository checker.

## Acceptance

- Node regression suite passes.
- Full-repository checker exits 0.
- Strict OpenSpec validation passes.
