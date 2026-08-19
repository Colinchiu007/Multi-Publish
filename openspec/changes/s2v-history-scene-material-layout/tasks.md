## 1. Specification and test matrix

- [x] 1.1 Finish the proposal/design and validate the modified capability delta with openspec validate --strict.
- [x] 1.2 Update focused ResultView tests for four visual cards, radio-only selection, preview-only thumbnail activation, normalized video selection, empty frames, button ownership, busy guards, and the large preview modal.

## 2. Renderer implementation

- [x] 2.1 Replace the ancestor label material card with explicit article, thumbnail button, radio, and label controls.
- [x] 2.2 Keep the four visual slots stable, normalize video selection to persisted video, fix image/video preview type detection, and use the xl preview modal.
- [x] 2.3 Move one image action into the Image 1 card and one AI-video action into the Video 1 card, preserving existing busy and prompt guards.
- [x] 2.4 Apply fixed media-frame geometry and responsive card/action styles for populated and empty slots.

## 3. Locales and documentation

- [x] 3.1 Add/update paired zh/en material labels and accessible preview/empty-state text.
- [x] 3.2 Update Story2Video PRDs, changelog, and learnings with data validation, event flow, visible labels, prompt guards, and edge cases.

## 4. Verification and delivery

- [x] 4.1 Run focused and relevant desktop tests, locale synchronization, lint/build checks, and diff hygiene checks.
- [x] 4.2 Perform dual-model review or record external-model degradation, resolve findings, and write the CCG review artifact.
- [ ] 4.3 Commit the branch, push it, open/merge the GitHub PR, verify origin/main, archive the OpenSpec/CCG task, and update remote status.
