/**
 * PluginLoader — 本地文件插件加载器
 * 
 * Plugin API:
 *   class MyPlugin {
 *     get platform()      // string, required — 唯一标识
 *     get displayName()   // string, optional — 显示名称
 *     async publish(postData, cookie) // optional — RPA 发布
 *     async publishViaApi(postData, config) // optional — API 发布
 *     async validate()    // optional — 启动时校验
 *   }
 * 
 * 目录结构:
 *   plugins/
 *     my-plugin.js           → 单文件插件
 *     my-plugin/
 *       index.js             → 多文件插件的入口
 *       package.json         → 可选的元信息
 */
const fs = require("fs");
const path = require("path");

class PluginLoader {
  /**
   * @param {string} [pluginsDir] — 插件目录，默认 apps/desktop/plugins
   */
  constructor(pluginsDir) {
    this._pluginsDir = pluginsDir || path.join(__dirname, "..", "..", "..", "apps", "desktop", "plugins");
    this._plugins = new Map();   // platform -> plugin instance
    this._errors = [];           // { file, error }
  }

  /** 加载所有插件 */
  loadAll() {
    this._plugins.clear();
    this._errors = [];

    if (!fs.existsSync(this._pluginsDir)) {
      try { fs.mkdirSync(this._pluginsDir, { recursive: true }); } catch (e) { /* ignore */ }
      return this._plugins;
    }

    const entries = fs.readdirSync(this._pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      try {
        // 单文件: *.js
        if (entry.isFile() && entry.name.endsWith(".js")) {
          this._loadFile(path.join(this._pluginsDir, entry.name));
        }
        // 目录: my-plugin/index.js
        else if (entry.isDirectory()) {
          const indexPath = path.join(this._pluginsDir, entry.name, "index.js");
          if (fs.existsSync(indexPath)) {
            this._loadFile(indexPath);
          }
        }
      } catch (e) {
        this._errors.push({ file: entry.name, error: e.message });
        console.warn(`[PluginLoader] Failed to load ${entry.name}: ${e.message}`);
      }
    }

    return this._plugins;
  }

  /** 加载单个文件 */
  _loadFile(filepath) {
    const PluginClass = require(filepath);
    // 支持 module.exports = class 和 module.exports = { MyPlugin }
    let Klass = PluginClass;
    if (typeof Klass !== "function") {
      // 尝试取第一个导出的类
      const keys = Object.keys(Klass);
      for (const key of keys) {
        if (typeof Klass[key] === "function" && Klass[key].prototype?.platform !== undefined) {
          Klass = Klass[key];
          break;
        }
      }
    }

    if (typeof Klass !== "function") {
      throw new Error(`Plugin file "${path.basename(filepath)}" does not export a valid plugin class`);
    }

    const instance = new Klass();
    if (!instance.platform || typeof instance.platform !== "string") {
      throw new Error(`Plugin "${path.basename(filepath)}" must have a "platform" getter returning a string`);
    }

    if (this._plugins.has(instance.platform)) {
      throw new Error(`Duplicate platform "${instance.platform}" from ${path.basename(filepath)}`);
    }

    this._plugins.set(instance.platform, instance);
    console.log(`[PluginLoader] Loaded plugin: ${instance.platform} (${instance.displayName || instance.platform})`);
  }

  /** 获取指定平台插件 */
  get(platform) {
    return this._plugins.get(platform) || null;
  }

  /** 获取所有已加载插件 */
  getAll() {
    const result = {};
    for (const [platform, instance] of this._plugins) {
      result[platform] = {
        platform: instance.platform,
        displayName: instance.displayName || instance.platform,
        hasPublish: typeof instance.publish === "function",
        hasPublishViaApi: typeof instance.publishViaApi === "function",
      };
    }
    return result;
  }

  /** 获取加载错误 */
  getErrors() {
    return [...this._errors];
  }

  /** 插件数量 */
  get count() { return this._plugins.size; }
}

module.exports = PluginLoader;
