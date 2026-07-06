# 插件开发指南 — Multi-Publish Plugin System

> 版本: 1.3.0 | 支持: Level 1-2C 完整实现

## 概述

Multi-Publish 插件系统允许第三方开发者扩展发布平台支持。插件以本地文件形式加载，支持元数据声明、生命周期管理和配置持久化。

## 快速开始

### 目录结构

```
apps/desktop/plugins/
  my-platform.js                  # 单文件插件（简单场景）
  my-platform.manifest.json       # 元数据（可选）

  my-platform/                    # 目录插件（复杂场景）
    index.js                      # 插件入口
    manifest.json                 # 元数据
    plugin.config.json            # 运行时配置（由 API 管理）
```

### 单文件插件示例

```javascript
// apps/desktop/plugins/my-platform.js
class MyPlatformPlugin {
  // 必填 — 平台唯一标识
  get platform() { return "my_platform"; }
  
  // 可选 — 显示名称
  get displayName() { return "我的平台";
  
  // === 发布方法（至少实现一个）===
  
  // API 发布（推荐）
  async publishViaApi(postData, config) {
    // postData: { title, content, tags, images, video }
    // config: { apiKey, apiSecret }
    const result = await fetch("https://api.example.com/publish", {
      method: "POST",
      headers: { "Authorization": "Bearer " + config.apiKey },
      body: JSON.stringify(postData)
    });
    return { success: true, publishId: "123", url: "https://..." };
  }
  
  // RPA 发布（降级方案）
  async publish(postData, cookie) {
    // cookie: 登录态 cookie
    // 实现浏览器自动化发布...
    return { success: true, publishId: "456" };
  }
}

module.exports = MyPlatformPlugin;
```

### manifest.json

```json
{
  "name": "my-platform",
  "version": "1.0.0",
  "minAppVersion": "1.8.0",
  "author": "开发者名称",
  "entry": "index.js",
  "permissions": ["publish", "upload"]
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| name | ✅ | 插件名，用于错误提示 |
| version | ✅ | 语义化版本 |
| minAppVersion | ❌ | 最低 app 版本，不满足时跳过加载 |
| author | ❌ | 作者信息 |
| entry | ❌ | 入口文件，默认 index.js |
| permissions | ❌ | 权限声明（框架预留） |

> **注意**: 无 manifest.json 的插件仍可加载，但标记为 `[legacy]`。建议新插件始终附带 manifest。

## 生命周期 Hook

插件可以在关键节点执行自定义逻辑：

```javascript
class MyPlugin {
  // 加载时调用（loadAll 阶段）
  async onLoad(ctx) {
    // ctx.config: 插件配置
    // ctx.appVersion: 当前 app 版本
    console.log("插件已加载");
  }
  
  // 启用时调用（首次加载 + 重新启用）
  async onEnable(ctx) {
    console.log("插件已启用");
  }
  
  // 禁用时调用
  async onDisable(ctx) {
    console.log("插件已禁用");
  }
  
  // 卸载时调用
  async onUnload(ctx) {
    // 清理资源
  }
}
```

> **崩溃隔离**: 所有 hook 的异步错误会被自动捕获，不会导致主进程崩溃。

## 插件管理 API

运行时通过 `PluginLoader` 管理插件：

```javascript
const PluginLoader = require("@multi-publish/api-publish-engine").pluginLoader;

// 加载所有插件
pluginLoader.loadAll();

// 获取插件实例
const plugin = pluginLoader.get("my_platform");

// 查询插件元数据
const info = pluginLoader.getPluginInfo("my_platform");
// 返回: { platform, displayName, hasPublish, hasPublishViaApi,
//         hasOnLoad, hasOnEnable, hasOnDisable, hasOnUnload,
//         manifest, isLegacy, isEnabled }

// 动态启用/禁用
pluginLoader.disable("my_platform");  // 禁用，调用 onDisable
pluginLoader.enable("my_platform");   // 重新启用，调用 onEnable

// 热重载
pluginLoader.reload("my_platform");   // 清除缓存后重载

// 分类查询
pluginLoader.getEnabled();            // 仅已启用
pluginLoader.getDisabled();           // 仅已禁用
pluginLoader.isEnabled("my_platform"); // true/false/null

// 配置管理
pluginLoader.getConfig("my_platform"); // 读取配置
pluginLoader.setConfig("my_platform", { apiKey: "xxx" }); // 写入配置
```

## 最佳实践

1. **优先实现 `publishViaApi`** — API 发布比 RPA 快 10-60x
2. **manifest.json 必须填写 version** — 用于版本兼容性检查
3. **onLoad 中只做初始化** — 不要做耗时操作
4. **配置敏感信息** — apiKey 等敏感信息通过 `setConfig` 管理
5. **错误处理** — `publish()` 返回 `{ success, publishId, error }` 格式

## 构建发布

插件开发完成后，放入 `apps/desktop/plugins/` 目录即可生效。

```bash
# 热重载所有插件（无需重启应用）
node -e "require('@multi-publish/api-publish-engine').reloadPlugins()"
```
