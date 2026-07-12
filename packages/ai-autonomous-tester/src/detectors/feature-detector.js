/**
 * FeatureDetector - 检测应用中已实现的功能
 *
 * 从路由、组件、API 端点检测功能点
 *
 * 使用方式:
 *   const { FeatureDetector } = require("@multi-publish/ai-autonomous-tester");
 *   const detector = new FeatureDetector({ srcDir: "./src" });
 *   const features = await detector.detect();
 */

const fs = require("fs");
const path = require("path");

class FeatureDetector {
  constructor(options = {}) {
    this.srcDir = options.srcDir || "src";
    this.routerPattern = options.routerPattern || /path:\s*["'`]([^"'`]+)["'`]/g;
    this.apiPattern = options.apiPattern || /router\.(get|post|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  }

  /**
   * 检测所有功能点
   */
  async detect() {
    const features = [];

    if (!fs.existsSync(this.srcDir)) {
      return features;
    }

    const routes = await this.detectFromRoutes();
    features.push(...routes);

    const apis = await this.detectFromAPIs();
    features.push(...apis);

    return features;
  }

  /**
   * 从路由文件检测
   */
  async detectFromRoutes() {
    const features = [];
    const files = this.walkSync(this.srcDir, /\.(js|ts|vue)$/);

    for (const file of files) {
      if (!/router|routes/i.test(file)) continue;
      const content = fs.readFileSync(file, "utf8");
      const matches = content.matchAll(this.routerPattern);

      for (const m of matches) {
        const routePath = m[1];
        features.push({
          name: this.pathToFeatureName(routePath),
          type: "route",
          path: routePath,
          source: "code",
          file,
        });
      }
    }

    return features;
  }

  /**
   * 从 API 端点检测
   */
  async detectFromAPIs() {
    const features = [];
    const files = this.walkSync(this.srcDir, /\.(js|ts)$/);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const matches = content.matchAll(this.apiPattern);

      for (const m of matches) {
        const method = m[1].toUpperCase();
        const apiPath = m[2];
        features.push({
          name: `${method} ${this.pathToFeatureName(apiPath)}`,
          type: "api",
          method,
          path: apiPath,
          source: "code",
          file,
        });
      }
    }

    return features;
  }

  /**
   * 路径转功能名
   */
  pathToFeatureName(p) {
    return p
      .replace(/^\//, "")
      .replace(/^api\//, "")
      .replace(/-/g, " ")
      .replace(/\//g, " > ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * 同步遍历目录
   */
  walkSync(dir, pattern) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        results.push(...this.walkSync(fullPath, pattern));
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }
}

module.exports = { FeatureDetector };
