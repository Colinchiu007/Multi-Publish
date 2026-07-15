/**
 * PluginLoader — 本地文件插件加载器 (Level 2B: 动态 enable/disable/reload)
 *
 * Plugin API:
 *   class MyPlugin {
 *     get platform()      // string, required
 *     get displayName()   // string, optional
 *     async onLoad(ctx)        // optional
 *     async onEnable(ctx)      // optional
 *     async onDisable(ctx)     // optional
 *     async onUnload(ctx)      // optional
 *     async publish(postData, cookie)         // optional
 *     async publishViaApi(postData, config)   // optional
 *     async validate()         // optional
 *     async beforePublish(ctx) // optional (PRD F16.3) — 返回 {proceed:false,reason} 拒绝；返回 {article} 修改
 *     async afterPublish(ctx)  // optional (PRD F16.3) — 发布完成后调用，ctx={article,account,result,success}
 *   }
 *
 * manifest.json:
 *   name, version (required), minAppVersion, author, entry, permissions
 */

const fs = require("fs");
const path = require("path");

class PluginLoader {
  constructor(pluginsDir) {
    this._pluginsDir = pluginsDir || path.join(__dirname, "..", "..", "..", "apps", "desktop", "plugins");
    this._plugins = new Map();
    this._manifests = new Map();
    this._legacy = new Set();
    this._disabled = new Set();
    this._pluginDirs = new Map();
    this._errors = [];
    this._appVersion = "1.8.0";
  }

  setAppVersion(version) {
    this._appVersion = version;
  }

  loadAll() {
    this._plugins.clear();
    this._manifests.clear();
    this._legacy.clear();
    this._disabled.clear();
    this._pluginDirs.clear();
    this._errors = [];

    if (!fs.existsSync(this._pluginsDir)) {
      try { fs.mkdirSync(this._pluginsDir, { recursive: true }); } catch (e) { console.warn('[PluginLoader] mkdir failed:', e.message); }
      return this._plugins;
    }

    const entries = fs.readdirSync(this._pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      try {
        if (entry.isFile() && entry.name.endsWith(".js")) {
          this._loadFile(path.join(this._pluginsDir, entry.name));
        } else if (entry.isDirectory()) {
          const indexPath = path.join(this._pluginsDir, entry.name, "index.js");
          if (fs.existsSync(indexPath)) { this._loadFile(indexPath); }
        }
      } catch (e) {
        this._errors.push({ file: entry.name, error: e.message });
        console.warn("[PluginLoader] Failed to load " + entry.name + ": " + e.message);
      }
    }
    return this._plugins;
  }

  _findManifest(filepath) {
    const dir = path.dirname(filepath);
    const basename = path.basename(filepath, ".js");
    const dirManifest = path.join(dir, "manifest.json");
    if (fs.existsSync(dirManifest)) return this._parseManifest(dirManifest);
    const fileManifest = path.join(dir, basename + ".manifest.json");
    if (fs.existsSync(fileManifest)) return this._parseManifest(fileManifest);
    return null;
  }

  _parseManifest(manifestPath) {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8")); }
    catch (e) { throw new Error("Invalid manifest at " + manifestPath + ": " + e.message); }
    if (!raw.name || typeof raw.name !== "string")
      throw new Error("manifest at " + manifestPath + " missing name");
    if (!raw.version || typeof raw.version !== "string")
      throw new Error("manifest at " + manifestPath + " missing version");
    return {
      name: raw.name, version: raw.version,
      minAppVersion: raw.minAppVersion || null,
      author: raw.author || null, entry: raw.entry || null,
      permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
    };
  }

  _checkVersionCompatibility(manifest) {
    if (!manifest.minAppVersion) return true;
    return this._compareVersions(this._appVersion, manifest.minAppVersion) >= 0;
  }

  _compareVersions(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0, nb = pb[i] || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  _loadFile(filepath) {
    const manifest = this._findManifest(filepath);
    if (manifest && !this._checkVersionCompatibility(manifest)) {
      throw new Error("Plugin " + manifest.name + " requires app >= " + manifest.minAppVersion + ", current=" + this._appVersion);
    }
    const PluginClass = require(filepath);
    let Klass = PluginClass;
    if (typeof Klass !== "function") {
      for (const key of Object.keys(Klass)) {
        if (typeof Klass[key] === "function" && Klass[key].prototype && Klass[key].prototype.platform !== undefined) {
          Klass = Klass[key]; break;
        }
      }
    }
    if (typeof Klass !== "function")
      throw new Error("Plugin " + path.basename(filepath) + " does not export a valid class");
    const instance = new Klass();
    if (!instance.platform || typeof instance.platform !== "string")
      throw new Error("Plugin " + path.basename(filepath) + " must have platform getter");
    if (this._plugins.has(instance.platform))
      throw new Error("Duplicate platform " + instance.platform);
    this._plugins.set(instance.platform, instance);
    this._disabled.delete(instance.platform);
    this._manifests.set(instance.platform, manifest);
    this._pluginDirs.set(instance.platform, filepath);
    if (!manifest) this._legacy.add(instance.platform);
    if (typeof instance.onLoad === "function")
      instance.onLoad({ config: {}, appVersion: this._appVersion }).catch(function() {});
    console.log("[PluginLoader] Loaded: " + instance.platform + (manifest ? " [v" + manifest.version + "]" : " [legacy]"));
  }

  get(platform) { return this._plugins.get(platform) || null; }

  /**
   * PRD F16.3: 发布前置钩子 — 在执行发布前调用，可修改/拒绝发布
   * @param {string} platform - 目标平台
   * @param {object} ctx - { article, account, config } 发布上下文
   * @returns {Promise<{proceed: boolean, article?: object, reason?: string}>}
   *   - proceed=false 时中止发布，reason 给出原因
   *   - 返回 article 时用修改后的 article 替换原 article
   */
  async runBeforePublish(platform, ctx) {
    const inst = this._plugins.get(platform);
    if (!inst || this._disabled.has(platform)) return { proceed: true };
    if (typeof inst.beforePublish !== "function") return { proceed: true };
    try {
      const result = await inst.beforePublish(ctx || {});
      if (result === false) return { proceed: false, reason: "Plugin beforePublish returned false" };
      if (result && typeof result === "object" && result.proceed === false) {
        return { proceed: false, reason: result.reason || "Plugin beforePublish rejected" };
      }
      // 返回 article 或返回 true/undefined → 继续，可能用返回的 article
      const article = (result && result.article) || (typeof result === "object" ? result.article : undefined);
      return { proceed: true, article: article };
    } catch (e) {
      console.warn("[PluginLoader] beforePublish error for " + platform + ": " + e.message);
      return { proceed: true };  // 钩子异常不阻塞发布
    }
  }

  /**
   * PRD F16.3: 发布后置钩子 — 在发布完成后调用
   * @param {string} platform - 目标平台
   * @param {object} ctx - { article, account, result, success } 发布结果上下文
   * @returns {Promise<void>}
   */
  async runAfterPublish(platform, ctx) {
    const inst = this._plugins.get(platform);
    if (!inst || this._disabled.has(platform)) return;
    if (typeof inst.afterPublish !== "function") return;
    try {
      await inst.afterPublish(ctx || {});
    } catch (e) {
      console.warn("[PluginLoader] afterPublish error for " + platform + ": " + e.message);
    }
  }

  getPluginInfo(platform) {
    if (!this._plugins.has(platform) && !this._disabled.has(platform)) return null;
    const inst = this._plugins.get(platform);
    const m = this._manifests.get(platform);
    return {
      platform: inst ? inst.platform : platform,
      displayName: inst ? (inst.displayName || inst.platform) : platform,
      hasPublish: inst ? typeof inst.publish === "function" : false,
      hasPublishViaApi: inst ? typeof inst.publishViaApi === "function" : false,
      hasOnLoad: inst ? typeof inst.onLoad === "function" : false,
      hasOnEnable: inst ? typeof inst.onEnable === "function" : false,
      hasOnDisable: inst ? typeof inst.onDisable === "function" : false,
      hasOnUnload: inst ? typeof inst.onUnload === "function" : false,
      manifest: m,
      isLegacy: this._legacy.has(platform),
      isEnabled: !this._disabled.has(platform),
    };
  }

  getAll() {
    const result = {};
    const addPlatform = (platform) => {
      const info = this.getPluginInfo(platform);
      if (info) {
        result[platform] = {
          platform: info.platform,
          displayName: info.displayName,
          hasPublish: info.hasPublish,
          hasPublishViaApi: info.hasPublishViaApi,
          manifestVersion: info.manifest ? info.manifest.version : null,
          isLegacy: info.isLegacy,
          isEnabled: info.isEnabled,
        };
      }
    };
    for (const [platform] of this._plugins) addPlatform(platform);
    for (const platform of this._disabled) addPlatform(platform);
    return result;
  }

  getErrors() { return [...this._errors]; }
  get count() { return this._plugins.size + this._disabled.size; }

  isEnabled(platform) {
    if (!this._plugins.has(platform) && !this._disabled.has(platform)) return null;
    return !this._disabled.has(platform);
  }

  disable(platform) {
    if (!this._plugins.has(platform) && !this._disabled.has(platform))
      throw new Error("Unknown platform: " + platform);
    if (this._disabled.has(platform)) return;
    const inst = this._plugins.get(platform);
    this._disabled.add(platform);
    this._plugins.delete(platform);
    if (inst && typeof inst.onDisable === "function")
      try { inst.onDisable({ appVersion: this._appVersion }).catch(function() {}); } catch(e) { console.warn('[PluginLoader] onDisable failed:', e.message); }
  }

  enable(platform) {
    if (!this._plugins.has(platform) && !this._disabled.has(platform))
      throw new Error("Unknown platform: " + platform);
    if (!this._disabled.has(platform)) return;
    this._disabled.delete(platform);
    const filepath = this._pluginDirs.get(platform);
    if (filepath && fs.existsSync(filepath)) {
      const manifest = this._findManifest(filepath);
      const PluginClass = require(filepath);
      let Klass = PluginClass;
      if (typeof Klass !== "function") {
        for (const key of Object.keys(Klass)) {
          if (typeof Klass[key] === "function" && Klass[key].prototype && Klass[key].prototype.platform !== undefined) {
            Klass = Klass[key]; break;
          }
        }
      }
      if (typeof Klass === "function") {
        const instance = new Klass();
        this._plugins.set(instance.platform, instance);
        this._manifests.set(instance.platform, manifest);
        this._pluginDirs.set(instance.platform, filepath);
        if (typeof instance.onEnable === "function")
          try { instance.onEnable({ appVersion: this._appVersion }).catch(function() {}); } catch(e) { console.warn('[PluginLoader] onEnable failed:', e.message); }
        console.log("[PluginLoader] Re-enabled: " + instance.platform);
      }
    }
  }

  reload(platform) {
    if (!this._plugins.has(platform) && !this._disabled.has(platform))
      throw new Error("Unknown platform: " + platform);
    const filepath = this._pluginDirs.get(platform);
    if (!filepath) throw new Error("Cannot reload: filepath not tracked");
    const resolved = require.resolve(filepath);
    delete require.cache[resolved];
    this._plugins.delete(platform);
    this._manifests.delete(platform);
    this._legacy.delete(platform);
    this._disabled.delete(platform);
    this._loadFile(filepath);
  }

  getEnabled() {
    const result = {};
    for (const [platform] of this._plugins) {
      result[platform] = this.getPluginInfo(platform);
    }
    return result;
  }

  getDisabled() {
    const result = {};
    for (const platform of this._disabled) {
      result[platform] = this.getPluginInfo(platform);
    }
    return result;
  }
  /** Get config for a plugin (or all configs if no platform specified) */
  getConfig(platform) {
    if (arguments.length === 0) {
      // Return all configs
      const result = {};
      for (const [p] of this._plugins) {
        const cfg = this.getConfig(p);
        if (cfg) result[p] = cfg;
      }
      for (const p of this._disabled) {
        if (!result[p]) {
          const cfg = this.getConfig(p);
          if (cfg) result[p] = cfg;
        }
      }
      return result;
    }
    const dir = this._pluginDirs.get(platform);
    if (!dir) return null;
    const cfgPath = path.join(path.dirname(dir), "plugin.config.json");
    try {
      if (fs.existsSync(cfgPath)) {
        return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      }
    } catch (e) { console.warn('[PluginLoader] getConfig failed:', e.message); }
    return null;
  }

  /** Set config for a plugin */
  setConfig(platform, config) {
    if (!this._pluginDirs.has(platform) && !this._disabled.has(platform)) {
      throw new Error("Unknown platform: " + platform);
    }
    const dir = this._pluginDirs.get(platform);
    if (!dir) throw new Error("Platform filepath not found: " + platform);
    const cfgPath = path.join(path.dirname(dir), "plugin.config.json");
    const tmpPath = cfgPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf-8");
    fs.renameSync(tmpPath, cfgPath);
  }

}

module.exports = PluginLoader;
