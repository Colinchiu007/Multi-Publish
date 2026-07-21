/**
 * FeatureDetector - ���Ӧ������ʵ�ֵĹ��ܣ�Ϊ Agent �ṩ�����ģ�
 *
 * �ɼ���ά����Ϣ�� Agent �Ķ�������ƥ���жϣ�
 * - Routes (Vue Router: path + name)
 * - Navigation menu items
 * - Page titles / H1
 * - Test IDs
 * - Sidebar/menu structure
 * - Component-level exports
 *
 * ʹ�÷�ʽ:
 *   const detector = new FeatureDetector({ srcDir: "./src" });
 *   const features = await detector.detect();
 *   // �� features �� Agent���� Agent ��������� PRD ƥ��
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
