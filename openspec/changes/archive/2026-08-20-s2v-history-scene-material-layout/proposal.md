## Why

The historical Story2Video editor currently mixes two different actions in the same material card: opening a thumbnail preview and changing the material used for recomposition. The renderer also exposes four visual slots while the persisted service contract has only three material identities, and the current action row duplicates generation buttons for every slot. These mismatches make selection surprising, leave empty slots visually unstable, and allow stale or unexplained placeholder text to leak into the editor.

## What Changes

- Keep four fixed visual cards per scene in the order Image 1, Image 2, Video 1, Video 2, including stable empty-card geometry.
- Move each radio input below its thumbnail and before its material label; only the radio change event can select a material.
- Make a populated thumbnail a preview-only control and enlarge the preview modal; empty thumbnails remain inert.
- Render one Generate New Image action inside the Image 1 card and one Generate AI Video action inside the Video 1 card, with no duplicate actions in the other visual slots.
- Normalize the visual video slot identity to the persisted video kind before calling the existing selection IPC; do not expand the backend data model in this change.
- Restrict empty media cards to the localized empty-state label and a fixed thumbnail-sized background.
- Add component regressions for DOM order, event isolation, preview media type, button ownership, empty-state output, and busy/validation behavior.
- Synchronize the Story2Video PRDs, changelog, learnings, and the formal material-selection specification with the corrected interaction contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- story2video-history-material-selection: change the ResultView material-card interaction, visual-slot layout, preview sizing, action placement, empty-state rendering, and the renderer-to-service video-kind mapping.

## Impact

- Renderer: apps/desktop/src/views/ResultView.vue, its focused component tests, and the paired Story2Video locale dictionaries.
- Specifications and product documentation: the existing OpenSpec capability and Story2Video UX/product documents.
- No new dependency, IPC channel, persistence field, or backend MATERIAL_KINDS value is introduced.
