import {
  AbsoluteFill,
  Audio,
  Img,
  Series,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansSC";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

// ---------------------------------------------------------------------------
// Types — 与 story2video-engine/src/types.ts 保持同步
// ---------------------------------------------------------------------------

/** 图片动态效果类型（对应 story2video-engine ImageEffect） */
type ImageEffect =
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "zoom-pan"
  | "rotate"
  | "blur-in"
  | "none";

/** 转场效果类型（对应 story2video-engine TransitionEffect） */
type TransitionEffect =
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "none";

/** 水印位置 */
type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

/** 水印配置（对应 story2video-engine WatermarkConfig） */
interface WatermarkConfig {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  fontSize: number;
  opacity: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Scene & Props Types
// ---------------------------------------------------------------------------

export interface Story2VideoScene {
  /** 图片路径（URL、绝对路径或 public/ 相对路径） */
  imageUrl: string;
  /** 该场景持续帧数 */
  durationInFrames: number;
  /** 字幕文本 */
  subtitle?: string;
  /** TTS 音频路径 */
  audioUrl?: string;
  /** 图片动态效果 */
  effect?: ImageEffect;
  /** 转场效果（与下一场景之间） */
  transition?: TransitionEffect;
}

export interface Story2VideoSlideshowProps {
  scenes: Story2VideoScene[];
  /** 转场持续帧数（默认 15） */
  transitionDurationInFrames?: number;
  /** 字幕样式 */
  subtitleStyle?: {
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    highlightColor?: string;
  };
  /** 水印配置 */
  watermark?: WatermarkConfig;
  /** 背景音乐路径 */
  bgmUrl?: string;
  /** 背景音乐音量 (0-1) */
  bgmVolume?: number;
}

// ---------------------------------------------------------------------------
// Asset path resolver — handles URLs, absolute paths, and public/ relative paths
// ---------------------------------------------------------------------------

function resolveAsset(src: string): string {
  if (!src) return "";
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
    return src;
  }
  const clean = src.replace(/^file:\/\/\/?/, "");
  if (clean.startsWith("/") || /^[A-Za-z]:[\\/]/.test(clean)) {
    return `file:///${clean.replace(/\\/g, "/")}`;
  }
  return staticFile(clean);
}

// ---------------------------------------------------------------------------
// Image effect applier — translates Canvas-era effect names to Remotion transforms
// ---------------------------------------------------------------------------

interface EffectTransform {
  scale: number;
  translateX: number;
  translateY: number;
  rotate: number;
  blur: number;
}

function computeEffectTransform(
  effect: ImageEffect | undefined,
  progress: number,
): EffectTransform {
  // ease-in-out cubic
  const eased =
    progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

  const base: EffectTransform = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    rotate: 0,
    blur: 0,
  };

  if (!effect || effect === "none") return base;

  switch (effect) {
    case "zoom-in":
      return { ...base, scale: 1 + eased * 0.15 };
    case "zoom-out":
      return { ...base, scale: 1.15 - eased * 0.15 };
    case "pan-left":
      return { ...base, translateX: -eased * 0.1 };
    case "pan-right":
      return { ...base, translateX: eased * 0.1 };
    case "pan-up":
      return { ...base, translateY: -eased * 0.1 };
    case "pan-down":
      return { ...base, translateY: eased * 0.1 };
    case "zoom-pan":
      return { ...base, scale: 1 + eased * 0.12, translateX: -eased * 0.06 };
    case "rotate":
      return { ...base, scale: 1 + eased * 0.08, rotate: eased * 3 };
    case "blur-in":
      return { ...base, scale: 1 + eased * 0.05, blur: (1 - progress) * 4 };
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Single scene renderer
// ---------------------------------------------------------------------------

const SceneRenderer: React.FC<{
  scene: Story2VideoScene;
  transitionDurationInFrames: number;
  subtitleStyle: NonNullable<Story2VideoSlideshowProps["subtitleStyle"]>;
  watermark?: WatermarkConfig;
}> = ({ scene, transitionDurationInFrames, subtitleStyle, watermark }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const effect = scene.effect || "zoom-in";
  const progress = scene.durationInFrames > 1 ? frame / (scene.durationInFrames - 1) : 0;
  const transform = computeEffectTransform(effect, Math.min(progress, 1));

  // Transition: fade-in at start, fade-out at end
  const fadeIn = interpolate(frame, [0, transitionDurationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [scene.durationInFrames - transitionDurationInFrames, scene.durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  // Subtitle spring animation
  const subtitleSpring = spring({
    frame: Math.max(0, frame - 5),
    fps,
    config: { damping: 18, stiffness: 120, mass: 1 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Image with effect */}
      <AbsoluteFill
        style={{
          opacity,
          transform: `scale(${transform.scale}) translate(${transform.translateX * 100}%, ${
            transform.translateY * 100
          }%) rotate(${transform.rotate}deg)`,
          filter: transform.blur > 0.1 ? `blur(${transform.blur}px)` : "none",
        }}
      >
        <Img
          src={resolveAsset(scene.imageUrl)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* TTS Audio */}
      {scene.audioUrl && <Audio src={resolveAsset(scene.audioUrl)} />}

      {/* Subtitle */}
      {scene.subtitle && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 80,
          }}
        >
          <div
            style={{
              opacity: subtitleSpring,
              transform: `translateY(${interpolate(subtitleSpring, [0, 1], [20, 0])}px)`,
              backgroundColor: subtitleStyle.backgroundColor || "rgba(0, 0, 0, 0.75)",
              color: subtitleStyle.color || "#FFFFFF",
              fontSize: subtitleStyle.fontSize || 48,
              fontFamily,
              fontWeight: 700,
              padding: "12px 32px",
              borderRadius: 8,
              maxWidth: "80%",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {scene.subtitle}
          </div>
        </AbsoluteFill>
      )}

      {/* Watermark */}
      {watermark?.enabled && watermark.text && (
        <Watermark watermark={watermark} />
      )}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------

const Watermark: React.FC<{ watermark: WatermarkConfig }> = ({ watermark }) => {
  const positionStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      position: "absolute",
      fontSize: watermark.fontSize,
      color: watermark.color,
      opacity: watermark.opacity,
      fontFamily,
      pointerEvents: "none",
    };
    switch (watermark.position) {
      case "top-left":
        return { ...base, top: 20, left: 20 };
      case "top-right":
        return { ...base, top: 20, right: 20 };
      case "bottom-left":
        return { ...base, bottom: 20, left: 20 };
      case "bottom-right":
        return { ...base, bottom: 20, right: 20 };
      case "center":
        return { ...base, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
      default:
        return { ...base, bottom: 20, right: 20 };
    }
  })();

  return <div style={positionStyle}>{watermark.text}</div>;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const Story2VideoSlideshow: React.FC<Story2VideoSlideshowProps> = ({
  scenes,
  transitionDurationInFrames = 15,
  subtitleStyle = {},
  watermark,
  bgmUrl,
  bgmVolume = 0.3,
}) => {
  const defaultSubtitleStyle = {
    fontSize: 48,
    color: "#FFFFFF",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    highlightColor: "#FACC15",
    ...subtitleStyle,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Series>
        {scenes.map((scene, index) => (
          <Series.Sequence
            key={index}
            durationInFrames={scene.durationInFrames}
          >
            <SceneRenderer
              scene={scene}
              transitionDurationInFrames={transitionDurationInFrames}
              subtitleStyle={defaultSubtitleStyle}
              watermark={watermark}
            />
          </Series.Sequence>
        ))}
      </Series>

      {/* Background music */}
      {bgmUrl && (
        <Audio src={resolveAsset(bgmUrl)} volume={bgmVolume} />
      )}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Metadata calculator — computes total duration from scene durations
// ---------------------------------------------------------------------------

export const calculateStory2VideoMetadata = async ({
  props,
}: {
  props: Story2VideoSlideshowProps;
}) => {
  const totalFrames = (props.scenes || []).reduce(
    (sum, scene) => sum + (scene.durationInFrames || 0),
    0,
  );
  return {
    durationInFrames: Math.max(totalFrames, 30),
    fps: 30,
    width: 1920,
    height: 1080,
  };
};
