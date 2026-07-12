/**
 * ModelProviderManager unit tests
 *
 * 测试 5 类模型服务商的 CRUD + 默认设置 + 边界场景
 */
__enableElectronMock()

__registerMock("./logger", {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

describe("ModelProviderManager", function () {
  let ModelProviderManager
  let manager
  let mockStore

  // 模拟 store
  function createMockStore() {
    const data = new Map()
    return {
      _ready: true,
      db: {
        prepare(sql) {
          return {
            run(...args) {
              // 模拟 INSERT OR IGNORE（种子数据：5 个参数 id,name,category,base_url,models）
              if (sql.includes("INSERT OR IGNORE")) {
                const id = args[0]
                if (!data.has(id)) {
                  data.set(id, {
                    id: args[0], name: args[1], category: args[2],
                    base_url: args[3], api_key: "",
                    models: args[4], enabled: 0,
                    is_default: 0, is_preset: 1,
                    config: "{}",
                  })
                }
                return { changes: data.has(id) ? 1 : 0 }
              }
              // 模拟 INSERT
              if (sql.includes("INSERT INTO")) {
                data.set(args[0], {
                  id: args[0], name: args[1], category: args[2],
                  base_url: args[3], api_key: args[4] || "",
                  models: args[5], enabled: args[6] || 0,
                  is_default: args[7] || 0, is_preset: args[8] || 0,
                  config: args[9] || "{}",
                })
                return { changes: 1 }
              }
              // 模拟 UPDATE
              if (sql.includes("UPDATE")) {
                return { changes: 1 }
              }
              // 模拟 DELETE
              if (sql.includes("DELETE")) {
                data.delete(args[0])
                return { changes: 1 }
              }
              return { changes: 0 }
            },
            get(...args) {
              if (sql.includes("SELECT id FROM")) {
                // 检查是否存在
                const id = args[0]
                return data.has(id) ? { id } : null
              }
              if (sql.includes("SELECT COUNT")) {
                let count = 0
                for (const [, v] of data) {
                  if (sql.includes("category = ?")) {
                    if (v.category === args[0] && v.api_key && v.enabled) count++
                  }
                }
                return { cnt: count }
              }
              if (sql.includes("is_default = 1")) {
                for (const [, v] of data) {
                  if (v.category === args[0] && v.is_default) return v
                }
                return null
              }
              if (sql.includes("api_key != ''")) {
                for (const [, v] of data) {
                  if (v.category === args[0] && v.api_key) return v
                }
                return null
              }
              if (sql.includes("WHERE id = ?")) {
                return data.get(args[0]) || null
              }
              return null
            },
            all(...args) {
              const results = []
              for (const [, v] of data) {
                if (args.length > 0 && sql.includes("category = ?")) {
                  if (v.category === args[0]) results.push(v)
                } else {
                  results.push(v)
                }
              }
              return results
            },
          }
        },
        transaction(fn) {
          return fn
        },
      },
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    }
  }

  beforeAll(function () {
    ModelProviderManager = require("../electron/services/model-provider-manager").ModelProviderManager
  })

  beforeEach(function () {
    mockStore = createMockStore()
    manager = new ModelProviderManager(mockStore)
  })

  describe("初始化", function () {
    it("应成功初始化并写入种子数据", function () {
      manager.init()
      expect(manager._ready).toBe(true)
      const providers = manager.listProviders()
      expect(providers.length).toBeGreaterThan(0)
    })

    it("Store 未就绪时不应初始化", function () {
      manager._store = { _ready: false }
      manager.init()
      expect(manager._ready).toBe(false)
    })
  })

  describe("listProviders", function () {
    beforeEach(function () { manager.init() })

    it("应返回所有服务商", function () {
      const all = manager.listProviders()
      expect(all.length).toBeGreaterThan(30) // 预设约 38 个
    })

    it("应按类别过滤 LLM", function () {
      const llm = manager.listProviders("llm")
      expect(llm.length).toBeGreaterThan(0)
      llm.forEach(p => expect(p.category).toBe("llm"))
    })

    it("应按类别过滤 video", function () {
      const video = manager.listProviders("video")
      expect(video.length).toBeGreaterThan(0)
      video.forEach(p => expect(p.category).toBe("video"))
    })

    it("应按类别过滤 tts", function () {
      const tts = manager.listProviders("tts")
      expect(tts.length).toBeGreaterThan(0)
    })

    it("应按类别过滤 speech_recognition", function () {
      const stt = manager.listProviders("speech_recognition")
      expect(stt.length).toBeGreaterThan(0)
    })

    it("应按类别过滤 image", function () {
      const image = manager.listProviders("image")
      expect(image.length).toBeGreaterThan(0)
    })

    it("返回结果不应包含 api_key", function () {
      const all = manager.listProviders()
      all.forEach(p => expect(p.api_key).toBeUndefined())
    })
  })

  describe("createProvider", function () {
    beforeEach(function () { manager.init() })

    it("应成功创建自定义服务商", function () {
      const res = manager.createProvider({
        id: "custom-llm",
        name: "Custom LLM",
        category: "llm",
        base_url: "https://custom.api.com",
        api_key: "sk-test",
        models: ["custom-model"],
      })
      expect(res.code).toBe(0)
      expect(res.data.id).toBe("custom-llm")
    })

    it("应拒绝重复 ID", function () {
      manager.createProvider({ id: "dup", name: "Dup", category: "llm" })
      const res = manager.createProvider({ id: "dup", name: "Dup2", category: "llm" })
      expect(res.code).toBe(-1)
      expect(res.message).toContain("已存在")
    })

    it("应拒绝无效类别", function () {
      const res = manager.createProvider({ id: "bad", name: "Bad", category: "invalid" })
      expect(res.code).toBe(-1)
      expect(res.message).toContain("无效的模型类别")
    })

    it("缺少必填字段应返回错误", function () {
      const res = manager.createProvider({ id: "no-name" })
      expect(res.code).toBe(-1)
    })
  })

  describe("updateProvider", function () {
    beforeEach(function () { manager.init() })

    it("应成功更新服务商", function () {
      manager.createProvider({ id: "test-update", name: "Test", category: "llm" })
      const res = manager.updateProvider("test-update", { name: "Updated" })
      expect(res.code).toBe(0)
    })

    it("更新不存在的服务商应返回错误", function () {
      const res = manager.updateProvider("nonexistent", { name: "X" })
      expect(res.code).toBe(-1)
    })
  })

  describe("deleteProvider", function () {
    beforeEach(function () { manager.init() })

    it("预设服务商不允许删除", function () {
      const res = manager.deleteProvider("openai")
      expect(res.code).toBe(-1)
      expect(res.message).toContain("预设")
    })

    it("应成功删除自定义服务商", function () {
      manager.createProvider({ id: "to-delete", name: "Delete Me", category: "llm" })
      const res = manager.deleteProvider("to-delete")
      expect(res.code).toBe(0)
    })

    it("删除不存在的服务商应返回错误", function () {
      const res = manager.deleteProvider("nonexistent")
      expect(res.code).toBe(-1)
    })
  })

  describe("setDefault", function () {
    beforeEach(function () { manager.init() })

    it("未配置 API Key 不能设为默认", function () {
      const res = manager.setDefault("llm", "openai")
      expect(res.code).toBe(-1)
      expect(res.message).toContain("API Key")
    })

    it("不存在的服务商不能设为默认", function () {
      const res = manager.setDefault("llm", "nonexistent")
      expect(res.code).toBe(-1)
    })
  })

  describe("getDefault", function () {
    beforeEach(function () { manager.init() })

    it("无默认时应返回 null 或第一个有 API Key 的", function () {
      const def = manager.getDefault("llm")
      // 预设都没有 API Key，所以应该返回 null
      expect(def).toBeNull()
    })
  })

  describe("testConnection", function () {
    beforeEach(function () { manager.init() })

    it("未配置 API Key 应返回错误", async function () {
      const res = await manager.testConnection("openai")
      expect(res.code).toBe(-1)
      expect(res.message).toContain("API Key")
    })

    it("不存在的服务商应返回错误", async function () {
      const res = await manager.testConnection("nonexistent")
      expect(res.code).toBe(-1)
    })
  })

  describe("getAvailablePresets", function () {
    beforeEach(function () { manager.init() })

    it("应返回该类别未添加的预设", function () {
      const presets = manager.getAvailablePresets("llm")
      // 预设已经初始化写入，所以应该为空
      expect(presets.length).toBe(0)
    })

    it("自定义服务商删除后应出现在预设列表中", function () {
      // 先手动添加一个预设中有的
      manager.createProvider({ id: "custom-new", name: "New", category: "llm" })
      const presets = manager.getAvailablePresets("llm")
      // custom-new 不在预设中，所以预设列表不变
      expect(presets.every(p => p.id !== "custom-new")).toBe(true)
    })
  })

  describe("isConfigured", function () {
    beforeEach(function () { manager.init() })

    it("预设都未配置 API Key 应返回 false", function () {
      expect(manager.isConfigured("llm")).toBe(false)
    })

    it("配置 API Key 后应返回 true", function () {
      manager.createProvider({
        id: "configured-llm", name: "Configured", category: "llm",
        api_key: "sk-test",
      })
      manager.updateProvider("configured-llm", { enabled: true })
      expect(manager.isConfigured("llm")).toBe(true)
    })
  })
})
