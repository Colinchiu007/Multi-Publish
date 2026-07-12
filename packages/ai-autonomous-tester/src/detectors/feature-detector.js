/**
 * FeatureDetector - 检测应用中已实现的功能
 *
 * Multi-dimension detection:
 * 1. Routes (Vue Router: path + name)
 * 2. Navigation menu items (Sidebar/Layout)
 * 3. Page titles (<title>, <h1>)
 * 4. Test IDs (data-testid)
 * 5. Business keywords (stores/api)
 *
 * Usage:
 *   const { FeatureDetector } = require("@multi-publish/ai-autonomous-tester");
 *   const detector = new FeatureDetector({ srcDir: "./src" });
 *   const features = await detector.detect();
 */

const fs = require("fs");
const path = require("path");

class FeatureDetector {
  constructor(options = {}) {
    this.srcDir = options.srcDir || "src";
    this.extensions = [".js", ".ts", ".vue"];
  }

  async detect() {
    if (!fs.existsSync(this.srcDir)) {
      return [];
    }

    const features = [];
    const seen = new Set();

    const add = (feature) => {
      const key = `${feature.name}|${feature.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        features.push(feature);
      }
    };

    const routes = await this.detectFromRoutes();
    routes.forEach(add);

    const navItems = await this.detectFromNavigation();
    navItems.forEach(add);

    const titles = await this.detectFromPageTitles();
    titles.forEach(add);

    const components = await this.detectFromComponents();
    components.forEach(add);

    const keywords = await this.detectFromKeywords();
    keywords.forEach(add);

    return features;
  }

  async detectFromRoutes() {
    const features = [];
    const files = this._findFiles(/router|routes/i);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const routeRe = /path:\s*["'`]\/([^"'`]+)["'`][\s\S]{0,200}?name:\s*["'`]([^"'`]+)["'`]/g;
      let m;
      while ((m = routeRe.exec(content)) !== null) {
        features.push({
          name: this._humanize(m[2]),
          type: "route",
          path: "/" + m[1],
          routeName: m[2],
          source: "code",
          file,
        });
      }
    }
    return features;
  }

  async detectFromNavigation() {
    const features = [];
    const files = this._findFiles(/layout|sidebar|menu|nav/i);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const titleRe = /(?:title|label|text):\s*["'`]([^"'`]+)["`']/g;
      let m;
      while ((m = titleRe.exec(content)) !== null) {
        const label = m[1].trim();
        if (this._isUsefulLabel(label)) {
          features.push({
            name: label,
            type: "nav-item",
            source: "code",
            file,
          });
        }
      }
    }
    return features;
  }

  async detectFromPageTitles() {
    const features = [];
    const files = this._findFiles(/views|pages|screens/i);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const titleRe = /<title>([^<]+)<\/title>/g;
      let m;
      while ((m = titleRe.exec(content)) !== null) {
        features.push({
          name: m[1].trim(),
          type: "page-title",
          source: "code",
          file,
        });
      }
      const h1Re = /<h1[^>]*>([^<]+)<\/h1>/g;
      while ((m = h1Re.exec(content)) !== null) {
        const label = m[1].trim();
        if (this._isUsefulLabel(label)) {
          features.push({
            name: label,
            type: "page-h1",
            source: "code",
            file,
          });
        }
      }
    }
    return features;
  }

  async detectFromComponents() {
    const features = [];
    const files = this._findFiles(/\.vue$/);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const tidRe = /data-testid=["']([^"']+)["']/g;
      let m;
      while ((m = tidRe.exec(content)) !== null) {
        const tid = m[1].trim();
        if (tid.includes("-") || /[A-Z]/.test(tid)) {
          features.push({
            name: this._humanize(tid),
            type: "testid",
            testid: tid,
            source: "code",
            file,
          });
        }
      }
    }
    return features;
  }

  async detectFromKeywords() {
    const features = [];
    // Match full feature phrases to avoid single-character false positives
    const keywordMap = {
      "AccountMgmt": ["Account"],
      "PublishMgmt": ["Publish"],
      "CreateMgmt": ["Create"],
      "VideoMgmt": ["Remotion", "Video"],
      "CollectionMgmt": ["Collection"],
      "CommentMgmt": ["Comment"],
      "AnalyticsMgmt": ["Analytics"],
      "IntelligenceMgmt": ["Intelligence"],
      "CloudPublish": ["Cloud"],
      "BatchMgmt": ["Batch"],
      "ScheduleMgmt": ["Schedule"],
      "MonitorRealTime": ["Monitor"],
      "DashboardHome": ["Dashboard"],
      "FirstRunFlow": ["FirstRun"],
      "ViralAnalysis": ["Viral"],
      "KeywordMonitor": ["Keyword"],
      "CalendarView": ["Calendar"],
      "PipelineWorkflow": ["Pipeline"],
    };

    for (const file of this._findFiles(/.*/)) {
      const content = fs.readFileSync(file, "utf8");
      for (const [featureName, keywords] of Object.entries(keywordMap)) {
        if (keywords.some(k => content.includes(k))) {
          features.push({
            name: featureName,
            type: "keyword",
            source: "code",
            file,
            confidence: this._calcConfidence(content, keywords),
          });
          break;
        }
      }
    }
    return features;
  }

  _calcConfidence(content, keywords) {
    let hits = 0;
    for (const kw of keywords) {
      hits += content.split(kw).length - 1;
    }
    if (hits >= 5) return "HIGH";
    if (hits >= 2) return "MEDIUM";
    return "LOW";
  }

  _humanize(s) {
    if (!s) return "";
    return s
      .replace(/[-_]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  _isUsefulLabel(label) {
    if (!label || label.length < 2 || label.length > 30) return false;
    if (/^(true|false|null|undefined|\d+)$/.test(label)) return false;
    if (/^(yes|no|ok|cancel|submit|reset|save|load|test|debug)$/i.test(label)) return false;
    return true;
  }

  _findFiles(pattern) {
    const results = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "dist") continue;
          walk(full);
        } else if (e.isFile() && this.extensions.some(ext => e.name.endsWith(ext)) && pattern.test(full)) {
          results.push(full);
        }
      }
    };
    walk(this.srcDir);
    return results;
  }
}

module.exports = { FeatureDetector };