export interface TextSceneInput {
  mode: 'text';
  text: string;
  theme?: string;
  secondsPerScene?: number;
  transitionOverlap?: number;
}

export interface ImageSceneInput {
  mode: 'gallery';
  images: string[];
  theme?: string;
  durationPerImage?: number;
  transitionOverlap?: number;
  animation?: string;
}

export type SceneInput = TextSceneInput | ImageSceneInput;

interface Cut {
  id: string;
  type?: string;
  text?: string;
  in_seconds: number;
  out_seconds: number;
  images?: string[];
  animation?: string;
  [key: string]: unknown;
}

export interface ScenePlan {
  cuts: Cut[];
  overlays: never[];
  captions: never[];
  audio: {};
  theme: string;
  durationInFrames: number;
}

const DEFAULT_SECONDS_PER_SCENE = 8;
const DEFAULT_DURATION_PER_IMAGE = 5;
const DEFAULT_TRANSITION_OVERLAP = 0.5;
const FPS = 30;

export function buildScenePlan(input: SceneInput): ScenePlan {
  const theme = input.theme || 'clean-professional';
  const overlap = input.transitionOverlap ?? DEFAULT_TRANSITION_OVERLAP;
  if (input.mode === 'text') return buildTextPlan(input, theme, overlap);
  return buildGalleryPlan(input, theme, overlap);
}

function buildTextPlan(input: TextSceneInput, theme: string, overlap: number): ScenePlan {
  const sps = input.secondsPerScene ?? DEFAULT_SECONDS_PER_SCENE;
  const lines = input.text.split('\n').filter((l) => l.trim());
  const cuts: Cut[] = lines.map((line, i) => ({
    id: `scene-${i}`, type: 'text_card', text: line.trim(),
    in_seconds: i * (sps - overlap), out_seconds: (i + 1) * sps - i * overlap,
  }));
  return { cuts, overlays: [], captions: [], audio: {}, theme,
    durationInFrames: Math.ceil((cuts.length > 0 ? cuts[cuts.length - 1].out_seconds + 1 : 1) * FPS) };
}

function buildGalleryPlan(input: ImageSceneInput, theme: string, overlap: number): ScenePlan {
  const dpi = input.durationPerImage ?? DEFAULT_DURATION_PER_IMAGE;
  const anim = input.animation || 'ken-burns';
  const cuts: Cut[] = input.images.map((img, i) => ({
    id: `scene-${i}`, type: 'anime_scene', images: [img], animation: anim,
    in_seconds: i * (dpi - overlap), out_seconds: (i + 1) * dpi - i * overlap,
  }));
  return { cuts, overlays: [], captions: [], audio: {}, theme,
    durationInFrames: Math.ceil((cuts.length > 0 ? cuts[cuts.length - 1].out_seconds + 1 : 1) * FPS) };
}
