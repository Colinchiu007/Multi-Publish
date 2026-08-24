## Context

See `proposal.md` for the motivation. A multimodal provider historically used one `is_default` marker to represent all of its declared capabilities. The current capability-default model also persists an explicit capability list, but selecting a normal provider only removes that list entry and leaves the global marker intact. Default lookup consequently sees two conflicting sources of truth.

The renderer already reloads the provider list after a successful default-setting IPC call and binds card state directly to the persisted `is_default` field. The fix therefore belongs at the persistence and routing boundary, not in a toast or CSS workaround.

## Goals / Non-Goals

**Goals:**

- Make a configured normal provider selected for a category the durable default used by runtime routing.
- Preserve a formerly global multimodal provider as the explicit default for its other declared capabilities.
- Make the reloaded provider list unambiguous for the settings card.

**Non-Goals:**

- Redesign the model-settings UI or add a new IPC API.
- Change model-level selection, video entitlement behavior, or provider catalog data.
- Eagerly rewrite every existing provider row during application startup.

## Decisions

1. Normalize a conflicting multimodal global default when a capability default is cleared.

   The shared conflict-clearing path will convert a global multimodal default into explicit defaults for its declared capabilities other than the newly selected category, then remove its global marker. This covers both normal-provider selection and future capability-level selection flows.

   Alternative: only change default lookup to prefer a normal provider. Rejected because persisted state and cards would still report conflicting defaults.

2. Preserve unrelated multimodal capabilities instead of disabling the whole provider.

   When OpenRouter becomes the text-reasoning default, the former multimodal provider retains explicit defaults such as TTS and image generation. This is the least surprising interpretation of a category-scoped user action.

   Alternative: clear every multimodal default. Rejected because it silently changes unrelated user settings.

3. Use manager-level integration tests plus the existing renderer composable refresh contract.

   The manager test verifies durable routing and row state with a real in-memory SQL store. The composable test verifies that a successful OpenRouter action consumes the reloaded list so the existing card binding receives the new `is_default` state.

## Risks / Trade-offs

- [Legacy multimodal row has no declared capabilities] → Its global marker is removed during a conflict rather than guessing which categories it owns; the selected normal provider remains correct and the user can explicitly reselect other capabilities.
- [Existing explicit defaults contain stale values] → Only the overridden category is removed; declared remaining capabilities are preserved in their existing order.
- [Rollback after a user action] → No schema migration is performed. The normalized explicit capability list remains valid input for both old and new code; reverting implementation code does not corrupt provider data.

## Migration Plan

1. Release without a schema migration.
2. Normalize only when the user changes a conflicting default, inside the existing atomic update path.
3. Verify both the persisted provider list and `getDefault('llm')` after selection.
4. If rollback is required, revert the code change; explicit capability defaults remain compatible persisted state.
