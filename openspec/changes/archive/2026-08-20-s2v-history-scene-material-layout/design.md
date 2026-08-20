## Context

The current ResultView renders four visual kinds (image1, image2, video1, video2) but the Electron service and IPC validation persist only image1, image2, and video. The same label currently wraps the radio and thumbnail, so browser label activation can select a radio while the user is only trying to preview. Generation actions are rendered from the slot loop, which duplicates them and places them outside the material cards.

## Goals / Non-Goals

**Goals:**

- Make preview and selection separate, explicit keyboard and pointer interactions.
- Preserve a four-card visual grid even when any image/video asset is missing.
- Keep the existing backend persistence and IPC validation contract intact.
- Make the modal and per-card generation controls match the visual hierarchy of the material area.

**Non-Goals:**

- Adding a second persisted video candidate or changing MATERIAL_KINDS.
- Changing image/video generation services, compose behavior, or file cleanup.
- Redesigning unrelated ResultView sections.

## Decisions

### 1. Separate the card, thumbnail, and radio semantics

Each visual slot becomes an article. The thumbnail is a button type=button that calls preview only when both a path and a resolved URL exist. The radio has an explicit id, name, value, disabled state, and associated label rendered below the thumbnail. The article itself has no selection click handler.

This is preferred over click-stop alone because native label activation can still select a radio through an ancestor label. It also gives keyboard users a distinct preview target and a distinct selection target.

### 2. Keep visual video aliases separate from persisted material kinds

The visual list remains four slots because the current renderer/data shape may contain a primary and alternate scene-video display path. A radio for either populated video visual slot maps to the service kind video, but the canonical selected-state badge is rendered only on video1 because the service persists one video identity. A visual slot without a path is disabled and cannot call selection IPC. This preserves the existing service contract and makes the enum boundary explicit.

### 3. Use a fixed media frame for every slot

The thumbnail frame uses a stable aspect ratio and a full-size background. Images and videos use object-fit: cover; empty slots render only the localized empty-state text. The card action area is laid out below the radio/label within the card, so its presence cannot resize or overlap the media frame.

### 4. Assign generation actions to one canonical visual card

The image generation action renders once in the Image 1 card, and the AI-video action renders once in the Video 1 card. The existing service operations are scene-level operations, so repeating an identical button in Image 2 or Video 2 would create ambiguous duplicate controls. The buttons retain their current busy guards, prompt guard, and test IDs.

### 5. Enlarge the existing preview modal without changing its component contract

ResultView uses the existing UiModal xl size and raises the preview media max height within responsive viewport bounds. Images use the image branch and both video1/video2 use the video branch. No modal dependency or IPC change is required.

## Risks / Trade-offs

- [Risk] Two visual video aliases can show the same persisted selection state. -> The UI labels and OpenSpec explicitly distinguish visual aliases from the single persisted video material, and tests assert the IPC receives video.
- [Risk] A missing resolved URL despite a path could look empty. -> Preview and radio enablement require a usable path/URL boundary, while the fixed frame remains visible and URL refresh keeps the existing fail-safe behavior.
- [Risk] Moving actions into cards can crowd narrow screens. -> The four-column desktop grid becomes a two-column mobile grid, each card keeps bounded controls, and the action wrapper allows wrapping without changing the media frame.

## Migration Plan

No data migration is required. Deploy the renderer and locale changes together with the documentation/spec updates. Rollback is a code revert; persisted selectedMaterial values remain backward compatible because the service contract is unchanged.
