import { registerRoot } from "remotion";
import { Root } from "./Root";

registerRoot(Root);

export { buildScenePlan } from "./scene-builder";
export type { SceneInput, TextSceneInput, ImageSceneInput, ScenePlan } from "./scene-builder";
export { validateProps } from "./props-validator";
export type { ValidationResult } from "./props-validator";
export { getProfile, listProfiles, getRemotionArgs, getFfmpegArgs } from "./media-profiles";
export type { MediaProfile } from "./media-profiles";
