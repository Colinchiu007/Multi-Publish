# Plan - OpenSpec sync-check hardening

1. Cover both directions of terminal task state drift and invalid supersession
   evidence with Node fixtures.
2. Enforce those invariants in the repository checker and keep the installed
   quality-rhythm template byte-aligned.
3. Repair historical task metadata exposed by the new invariant.
4. Run focused Node tests, repository scan, strict change validation, review,
   and remote merge before archive.
