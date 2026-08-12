import { describe, it, expect, afterEach } from "vitest";
import i18n, {
  detectSystemLocale,
  resolveAppLocale,
  setAppLocale,
  getAppLocale,
} from "@/i18n";
import {
  getPipelineCategory,
  getPipelineName,
} from "@/i18n/pipeline-labels";

function collectLeaves(node, path = "") {
  const leaves = [];
  for (const [key, value] of Object.entries(node)) {
    const next = path ? `${path}.${key}` : key;
    if (value && typeof value === "object") {
      leaves.push(...collectLeaves(value, next));
    } else {
      leaves.push({ path: next, value });
    }
  }
  return leaves;
}

function blockEvalLikeCsp() {
  const RealFunction = globalThis.Function;
  const cspSafeFunction = new Proxy(RealFunction, {
    construct(target, args) {
      if (args.some((arg) => typeof arg === "string")) {
        throw new EvalError("Refused to evaluate a string as JavaScript");
      }
      return Reflect.construct(target, args);
    },
  });
  globalThis.Function = cspSafeFunction;
  return () => {
    globalThis.Function = RealFunction;
  };
}

describe("i18n CSP-safe messages", () => {
  it("zh/en 全部消息叶子都是 Message Function，避免运行时编译", () => {
    for (const locale of ["zh", "en"]) {
      const messages = i18n.global.getLocaleMessage(locale);
      const leaves = collectLeaves(messages);
      expect(leaves.length).toBeGreaterThan(0);
      for (const leaf of leaves) {
        expect(typeof leaf.value, `${locale}.${leaf.path} 应转为函数`).toBe(
          "function"
        );
      }
    }
  });

  it("模拟 CSP 禁止 new Function 时翻译仍然可用（视频创作流水线文案）", () => {
    const restore = blockEvalLikeCsp();
    try {
      i18n.global.locale.value = "zh";
      expect(i18n.global.t("pipelines.names.story2video-compose")).toBe("全能创作");
      expect(i18n.global.t("pipelines.categories.generated")).toBe("AI 生成");
      expect(i18n.global.t("create.story2video.startPipeline")).toBe("启动流水线");

      const t = (key) => i18n.global.t(key);
      expect(getPipelineName(t, "story2video-compose")).toBe("全能创作");
      expect(getPipelineCategory(t, "generated")).toBe("AI 生成");

      i18n.global.locale.value = "en";
      expect(getPipelineName(t, "story2video-compose")).toBe("Omni Creation");
      expect(getPipelineCategory(t, "generated")).toBe("AI Generated");
    } finally {
      restore();
      i18n.global.locale.value = "zh";
    }
  });

  it("story2video 运行进度文案键存在且支持命名插值（zh/en）", () => {
    i18n.global.locale.value = "zh";
    try {
      expect(i18n.global.t("story2video.elapsed", { duration: "12 秒" })).toBe("已用时 12 秒");
      expect(i18n.global.t("story2video.durationSec", { seconds: 3 })).toBe("3 秒");
      expect(i18n.global.t("story2video.durationMinSec", { minutes: 1, seconds: 48 })).toBe("1 分 48 秒");
      i18n.global.locale.value = "en";
      expect(i18n.global.t("story2video.elapsed", { duration: "12s" })).toBe("Elapsed 12s");
      expect(i18n.global.t("story2video.durationSec", { seconds: 3 })).toBe("3s");
      expect(i18n.global.t("story2video.durationMinSec", { minutes: 1, seconds: 48 })).toBe("1m 48s");
    } finally {
      // 断言失败时也要恢复 locale，避免污染同文件后续用例（claude review I5）
      i18n.global.locale.value = "zh";
    }
  });
});

describe("系统语言自动检测与设置切换（user-facing-messages）", () => {
  const originalNavigatorLanguage = globalThis.navigator?.language;

  afterEach(() => {
    try { localStorage.removeItem("locale") } catch (_) {}
    if (typeof originalNavigatorLanguage === "string") {
      Object.defineProperty(globalThis.navigator, "language", {
        value: originalNavigatorLanguage,
        configurable: true,
      })
    }
    i18n.global.locale.value = "zh";
  });

  it("detectSystemLocale：zh* → zh，en* → en，其余 → en", () => {
    const set = (value) => Object.defineProperty(globalThis.navigator, "language", { value, configurable: true })
    set("zh-CN"); expect(detectSystemLocale()).toBe("zh")
    set("zh-Hans"); expect(detectSystemLocale()).toBe("zh")
    set("en-US"); expect(detectSystemLocale()).toBe("en")
    set("en-GB"); expect(detectSystemLocale()).toBe("en")
    set("fr-FR"); expect(detectSystemLocale()).toBe("en")
    set("ja-JP"); expect(detectSystemLocale()).toBe("en")
  });

  it("resolveAppLocale：显式设置优先于系统语言", () => {
    Object.defineProperty(globalThis.navigator, "language", { value: "en-US", configurable: true })
    try { localStorage.setItem("locale", "zh") } catch (_) {}
    expect(resolveAppLocale()).toBe("zh")
    try { localStorage.setItem("locale", "en") } catch (_) {}
    expect(resolveAppLocale()).toBe("en")
  });

  it("resolveAppLocale：无显式设置时按系统语言", () => {
    Object.defineProperty(globalThis.navigator, "language", { value: "en-US", configurable: true })
    expect(resolveAppLocale()).toBe("en")
    Object.defineProperty(globalThis.navigator, "language", { value: "zh-CN", configurable: true })
    expect(resolveAppLocale()).toBe("zh")
  });

  it("setAppLocale 持久化并即时生效，getAppLocale 返回当前语言", () => {
    expect(setAppLocale("en")).toBe("en")
    expect(getAppLocale()).toBe("en")
    expect(i18n.global.locale.value).toBe("en")
    try { expect(localStorage.getItem("locale")).toBe("en") } catch (_) {}
    expect(setAppLocale("zh")).toBe("zh")
    expect(getAppLocale()).toBe("zh")
  });
});
