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
      try { fs.mkdirSync(this._pluginsDir, { recursive: true }); } catch (e) {}
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
      inst.onDisable({ appVersion: this._appVersion }).catch(function() {});
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
          instance.onEnable({ appVersion: this._appVersion }).catch(function() {});
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
}

module.exports = PluginLoader;
