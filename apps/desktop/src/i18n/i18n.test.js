import { describe, it, expect } from "vitest";
import i18n from "@/i18n";
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
      expect(i18n.global.t("pipelines.names.story2video-compose")).toBe("图片轮播");
      expect(i18n.global.t("pipelines.categories.generated")).toBe("AI 生成");
      expect(i18n.global.t("create.story2video.startPipeline")).toBe("启动流水线");

      const t = (key) => i18n.global.t(key);
      expect(getPipelineName(t, "story2video-compose")).toBe("图片轮播");
      expect(getPipelineCategory(t, "generated")).toBe("AI 生成");

      i18n.global.locale.value = "en";
      expect(getPipelineName(t, "story2video-compose")).toBe("Image Carousel");
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
