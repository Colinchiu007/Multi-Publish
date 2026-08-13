// @ts-check
/**
 * useModelProviderCrud.test.js — 模型服务商 CRUD 测试
 *
 * 回归测试：修复 "An object could not be cloned" IPC 序列化错误
 * 根因：Vue ref 嵌套对象是 reactive proxy，直接传给 ipcRenderer.invoke() 会报错
 * 修复：submitForm 中用 JSON.parse(JSON.stringify()) 脱壳
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import i18n from '@/i18n'

// ─── Mock API ──────────────────────────────────────────────
vi.mock('@/api/model-providers', function () {
  return {
    modelProviderList: vi.fn(function () {
      return Promise.resolve({ code: 0, data: [] })
    }),
    modelProviderCreate: vi.fn(function (data) {
      // 关键验证：传入的 data 必须是纯对象（非 reactive proxy）
      // structured clone 会在这里模拟
      try {
        const clone = structuredClone(data)
        return Promise.resolve({ code: 0, data: clone })
      } catch (e) {
        return Promise.resolve({ code: -1, message: e.message })
      }
    }),
    modelProviderUpdate: vi.fn(function (id, data) {
      try {
        structuredClone(data)
        return Promise.resolve({ code: 0, data: { id } })
      } catch (e) {
        return Promise.resolve({ code: -1, message: e.message })
      }
    }),
    modelProviderDelete: vi.fn(function () {
      return Promise.resolve({ code: 0 })
    }),
    modelProviderSetDefault: vi.fn(function () {
      return Promise.resolve({ code: 0 })
    }),
    modelProviderGetDefault: vi.fn(function () {
      return Promise.resolve({ code: 0, data: null })
    }),
    modelProviderTest: vi.fn(function () {
      return Promise.resolve({ code: 0, data: { ok: true } })
    }),
    modelProviderPresets: vi.fn(function () {
      return Promise.resolve({ code: 0, data: [] })
    }),
    modelProviderIsConfigured: vi.fn(function () {
      return Promise.resolve({ code: 0, data: false })
    }),
  }
})

// ─── Mock publisher（多模态优先开关读写）───────────────────────
vi.mock('@/api/publisher', function () {
  return {
    storeGetSetting: vi.fn(function () { return Promise.resolve({ code: -1, message: 'electronAPI not available', data: null }) }),
    storeSetSetting: vi.fn(function () { return Promise.resolve({ code: 0 }) }),
  }
})

// ─── Mock Element Plus ─────────────────────────────────────
vi.mock('element-plus', function () {
  return {
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
    ElMessageBox: {
      confirm: vi.fn(function () { return Promise.resolve() }),
    },
  }
})

import { useModelProviderCrud } from '../composables/useModelProviderCrud'
import {
  modelProviderCreate,
  modelProviderUpdate,
  modelProviderList,
  modelProviderSetDefault,
  modelProviderTest,
} from '@/api/model-providers'

describe('useModelProviderCrud', function () {
  let crud
  let hostWrapper

  // useModelProviderCrud 内部调用 useI18n()，必须在组件 setup 上下文中实例化
  const Host = defineComponent({
    setup () {
      crud = useModelProviderCrud()
      return {}
    },
  })

  beforeEach(function () {
    i18n.global.locale.value = 'zh'
    hostWrapper = mount(Host, { global: { plugins: [i18n] } })
    vi.clearAllMocks()
  })

  // ─── 回归测试：IPC 序列化安全 ────────────────────────
  describe('IPC 序列化安全（"An object could not be cloned" 回归）', function () {
    it('submitForm 创建时传给 API 的 data 必须是纯对象', async function () {
      // 设置表单数据
      crud.form.value = {
        id: 'doubao-llm',
        name: '豆包',
        category: 'llm',
        base_url: 'https://ark.cn-beijing.volces.com/api/v3',
        api_key: 'sk-test123',
        models: ['doubao-pro-128k'],
        modelsText: 'doubao-pro-128k, doubao-pro-32k',
        config: { temperature: 0.7 },
      }

      await crud.submitForm()

      expect(modelProviderCreate).toHaveBeenCalledTimes(1)
      const calledData = modelProviderCreate.mock.calls[0][0]

      // 验证 1：data 是纯对象（不包含 proxy、函数、Symbol 等）
      expect(typeof calledData).toBe('object')
      expect(calledData).not.toBeNull()

      // 验证 2：可以安全 structuredClone（模拟 Electron IPC 序列化）
      expect(function () { structuredClone(calledData) }).not.toThrow()

      // 验证 3：字段值正确
      expect(calledData.id).toBe('doubao-llm')
      expect(calledData.name).toBe('豆包')
      expect(calledData.category).toBe('llm')
      expect(calledData.models).toEqual(['doubao-pro-128k', 'doubao-pro-32k'])
      expect(calledData.config).toEqual({ temperature: 0.7 })
    })

    it('submitForm 更新时传给 API 的 data 必须是纯对象', async function () {
      crud.isEditing.value = true
      crud.form.value = {
        id: 'doubao-llm',
        name: '豆包',
        category: 'llm',
        base_url: 'https://ark.cn-beijing.volces.com/api/v3',
        api_key: '',
        models: ['doubao-pro-128k'],
        modelsText: 'doubao-pro-128k',
        config: { temperature: 0.7 },
      }

      await crud.submitForm()

      expect(modelProviderUpdate).toHaveBeenCalledTimes(1)
      const calledId = modelProviderUpdate.mock.calls[0][0]
      const calledData = modelProviderUpdate.mock.calls[0][1]

      // ID 必须是字符串
      expect(typeof calledId).toBe('string')

      // data 必须可 structuredClone
      expect(function () { structuredClone(calledData) }).not.toThrow()
    })

    it('编辑保存时 API Key 留空不得上送空值', async function () {
      crud.isEditing.value = true
      crud.form.value = {
        id: 'minimax-image', name: 'MiniMax Image', category: 'image', base_url: '',
        api_key: '', models: ['image-01'], modelsText: 'image-01', config: {},
      }

      await crud.submitForm()

      const calledData = modelProviderUpdate.mock.calls[0][1]
      expect(calledData).not.toHaveProperty('api_key')
    })

    it('form.config 为 reactive proxy 时也能安全传递', async function () {
      // 模拟 Vue ref 包装后的 config 是 proxy
      crud.form.value = {
        id: 'test-provider',
        name: 'Test',
        category: 'llm',
        base_url: '',
        api_key: 'sk-test',
        models: [],
        modelsText: '',
        config: { nested: { deep: true } },
      }

      await crud.submitForm()

      const calledData = modelProviderCreate.mock.calls[0][0]
      // config 应该是深拷贝后的纯对象
      expect(calledData.config).toEqual({ nested: { deep: true } })
      // 验证不是同一个引用
      expect(calledData.config).not.toBe(crud.form.value.config)
    })

    it('submitForm 在 form.config 为 undefined 时不崩溃', async function () {
      crud.form.value = {
        id: 'test-provider',
        name: 'Test',
        category: 'llm',
        base_url: '',
        api_key: 'sk-test',
        models: [],
        modelsText: '',
        config: undefined,
      }

      await crud.submitForm()
      expect(modelProviderCreate).toHaveBeenCalledTimes(1)
      const calledData = modelProviderCreate.mock.calls[0][0]
      expect(calledData.config).toEqual({})
    })
  })

  // ─── 基本 CRUD 测试 ──────────────────────────────────
  describe('基本功能', function () {
    it('loadProviders 加载列表', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [{ id: 'test', name: 'Test', category: 'llm' }],
      })

      await crud.loadProviders()

      expect(crud.providers.value).toHaveLength(1)
      expect(crud.providers.value[0].id).toBe('test')
      expect(crud.loading.value).toBe(false)
    })

    it('新增远程服务商未填写 API Key 时阻止保存', async function () {
      crud.form.value = {
        id: 'minimax-image', name: 'MiniMax Image', category: 'image', base_url: 'https://api.minimaxi.com/v1',
        api_key: '   ', models: ['image-01'], modelsText: 'image-01', config: {},
      }

      await crud.submitForm()

      expect(modelProviderCreate).not.toHaveBeenCalled()
    })

    it('新增本地免 Key 预设遇到种子冲突时启用该服务商', async function () {
      modelProviderCreate.mockResolvedValueOnce({ code: 1, message: 'provider already exists' })
      modelProviderUpdate.mockResolvedValueOnce({ code: 0 })
      modelProviderList.mockResolvedValueOnce({ code: 0, data: [{ id: 'piper', name: 'Piper', category: 'tts', enabled: true, is_configured: true }] })
      crud.form.value = { id: 'piper', name: 'Piper', category: 'tts', base_url: '', api_key: '', models: ['piper'], modelsText: 'piper', config: {} }

      await crud.submitForm()

      expect(modelProviderUpdate).toHaveBeenCalledWith('piper', expect.objectContaining({ enabled: true }))
    })

    it('新增远程服务商成功后刷新列表包含新增项', async function () {
      modelProviderCreate.mockResolvedValueOnce({
        code: 0,
        data: { id: 'custom-image', name: 'Custom Image', category: 'image' },
      })
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [{ id: 'custom-image', name: 'Custom Image', category: 'image', is_preset: false, is_configured: true, api_key_masked: 'sk-***' }],
      })
      crud.form.value = {
        id: 'custom-image', name: 'Custom Image', category: 'image', base_url: 'https://api.example.com/v1',
        api_key: 'sk-test', models: [], modelsText: '', config: {},
      }

      await crud.submitForm()

      expect(crud.providers.value.map(p => p.id)).toContain('custom-image')
      expect(crud.filteredProviders.value.map(p => p.id)).toContain('custom-image')
    })

    it('新增后清除旧分类筛选，确保新服务商在返回列表中可见', async function () {
      modelProviderCreate.mockResolvedValueOnce({
        code: 0,
        data: { id: 'custom-llm', name: 'Custom LLM', category: 'llm' },
      })
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'existing-tts', name: 'Existing TTS', category: 'tts', is_preset: true, is_configured: true },
          { id: 'custom-llm', name: 'Custom LLM', category: 'llm', is_preset: false, is_configured: true },
        ],
      })
      crud.viewMode.value = 'configured'
      crud.filterCategory.value = 'tts'
      crud.form.value = {
        id: 'custom-llm', name: 'Custom LLM', category: 'llm', base_url: 'https://api.example.com/v1',
        api_key: 'sk-test', models: ['custom-llm-v1'], modelsText: 'custom-llm-v1', config: {},
      }

      await crud.submitForm()

      expect(crud.filterCategory.value).toBe('all')
      expect(crud.filteredProviders.value.map(p => p.id)).toContain('custom-llm')
    })
    it('filteredProviders 按类别过滤', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'a', name: 'A', category: 'llm' },
          { id: 'b', name: 'B', category: 'tts' },
        ],
      })
      await crud.loadProviders()

      crud.viewMode.value = 'all'
      crud.filterCategory.value = 'llm'
      expect(crud.filteredProviders.value).toHaveLength(1)
      expect(crud.filteredProviders.value[0].id).toBe('a')
    })

    it('submitForm 名称为空时显示警告', async function () {
      crud.form.value = { ...crud.form.value, name: '', id: '' }
      await crud.submitForm()
      expect(modelProviderCreate).not.toHaveBeenCalled()
    })

    it('loadProviders 返回异常格式时提示错误并结束加载态', async function () {
      modelProviderList.mockResolvedValueOnce({})

      await expect(crud.loadProviders()).resolves.toBeUndefined()

      const { ElMessage } = await import('element-plus')
      expect(ElMessage.error).toHaveBeenCalledWith('加载失败')
      expect(crud.providers.value).toEqual([])
      expect(crud.loading.value).toBe(false)
    })

    it('loadProviders 请求拒绝时提示格式化错误并结束加载态', async function () {
      modelProviderList.mockRejectedValueOnce(new Error('IPC 不可用'))

      await expect(crud.loadProviders()).resolves.toBeUndefined()

      const { ElMessage } = await import('element-plus')
      // 自然语言原因文本经统一文案格式化后原样透传（保留具体原因）
      expect(ElMessage.error).toHaveBeenCalledWith('IPC 不可用')
      expect(crud.loading.value).toBe(false)
    })

    it('submitForm 创建失败时保留对话框并复位提交状态', async function () {
      modelProviderCreate.mockResolvedValueOnce({ code: 1, message: '密钥无效' })
      crud.showFormDialog.value = true
      crud.form.value = {
        id: 'bad-provider', name: 'Bad', category: 'llm', base_url: '',
        api_key: 'bad-key', models: [], modelsText: '', config: {},
      }

      await crud.submitForm()

      const { ElMessage } = await import('element-plus')
      // 自然语言原因文本经统一文案格式化后原样透传（保留具体原因）
      expect(ElMessage.error).toHaveBeenCalledWith('密钥无效')
      expect(crud.showFormDialog.value).toBe(true)
      expect(crud.submitting.value).toBe(false)
    })

    it('submitForm 创建响应异常时显示默认错误且不崩溃', async function () {
      modelProviderCreate.mockResolvedValueOnce({})
      crud.form.value = {
        id: 'bad-response', name: 'Bad Response', category: 'llm', base_url: '',
        api_key: 'sk-test', models: [], modelsText: '', config: {},
      }

      await expect(crud.submitForm()).resolves.toBeUndefined()

      const { ElMessage } = await import('element-plus')
      expect(ElMessage.error).toHaveBeenCalledWith('保存失败')
      expect(crud.submitting.value).toBe(false)
    })

    it('编辑保存时 API Key 留空不得上送空值（避免清除已保存 Key）', async function () {
      crud.isEditing.value = true
      crud.form.value = {
        id: 'minimax-image',
        name: 'MiniMax Image',
        category: 'image',
        base_url: 'https://api.minimaxi.com/v1',
        api_key: '', // 用户未填写新 Key，按“留空保持不变”语义
        models: ['image-01', 'image-01-live'],
        modelsText: 'image-01, image-01-live',
        config: {},
      }

      await crud.submitForm()

      expect(modelProviderUpdate).toHaveBeenCalledTimes(1)
      const calledData = modelProviderUpdate.mock.calls[0][1]
      expect(calledData).not.toHaveProperty('api_key')
    })

    it('预设已存在时自动改为更新并刷新列表', async function () {
      modelProviderCreate.mockResolvedValueOnce({ code: 1, message: 'provider already exists' })
      modelProviderUpdate.mockResolvedValueOnce({ code: 0 })
      modelProviderList.mockResolvedValueOnce({ code: 0, data: [] })
      crud.showFormDialog.value = true
      crud.showAddDialog.value = true
      crud.form.value = {
        id: 'openai', name: 'OpenAI', category: 'llm', base_url: '',
        api_key: 'sk-test', models: [], modelsText: '', config: {},
      }

      await crud.submitForm()

      expect(modelProviderUpdate).toHaveBeenCalledWith('openai', expect.objectContaining({ api_key: 'sk-test' }))
      expect(modelProviderList).toHaveBeenCalledTimes(1)
      expect(crud.showFormDialog.value).toBe(false)
      expect(crud.showAddDialog.value).toBe(false)
    })

    it('loadAvailablePresets 转发 IPC 返回的非空预设列表', async function () {
      const { modelProviderPresets } = await import('@/api/model-providers')
      modelProviderPresets.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'flux', name: 'Flux', category: 'image', base_url: 'https://api.bfl.ml/v1', models: ['flux-pro'] },
          { id: 'dall-e', name: 'DALL-E', category: 'image', base_url: 'https://api.openai.com/v1', models: ['dall-e-3'] },
        ],
      })
      crud.addCategory.value = 'image'

      await crud.loadAvailablePresets()

      expect(modelProviderPresets).toHaveBeenCalledWith('image')
      expect(crud.availablePresets.value.map(p => p.id)).toEqual(['flux', 'dall-e'])
      expect(crud.availablePresets.value[0].base_url).toBeTruthy()
    })

    it('setDefault 在未配置密钥时拦截 IPC', async function () {
      await crud.setDefault({ id: 'openai', category: 'llm', api_key: '', api_key_masked: '' })

      const { ElMessage } = await import('element-plus')
      expect(ElMessage.warning).toHaveBeenCalledWith('请先配置 API Key 后再设为默认')
      expect(modelProviderSetDefault).not.toHaveBeenCalled()
    })

    it('testProvider 请求拒绝时记录稳定失败结果并复位 testingId', async function () {
      modelProviderTest.mockRejectedValueOnce(new Error('连接超时'))

      await crud.testProvider('openai')

      // formatUserError 把原始「连接超时」映射为当前语言（测试环境按系统语言 en）的
      // 「原因 + 建议」文案，不直出原始技术文本
      const testResult = crud.testResults.value.openai
      expect(testResult.success).toBe(false)
      expect(testResult.code).toBe(-1)
      expect(testResult.message).not.toBe('连接超时')
      expect(testResult.message.length).toBeGreaterThan(0)
      expect(testResult.detail).toBeNull()
      expect(crud.testingId.value).toBe('')
    })

  // ─── 视图模式分组测试 ──────────────────────────────
  describe('视图模式分组', function () {
    it('默认 viewMode 为 configured', function () {
      expect(crud.viewMode.value).toBe('configured')
    })

    it('配置状态只信任主进程的 is_configured，不能由掩码或遗留 api_key 推断', function () {
      crud.providers.value = [
        { id: 'disabled-with-key', name: 'Disabled', category: 'llm', enabled: false, is_configured: false, api_key_masked: 'sk-***' },
        { id: 'configured', name: 'Configured', category: 'llm', enabled: true, is_configured: true, api_key_masked: 'sk-***' },
      ]

      expect(crud.configuredProviders.value.map(p => p.id)).toEqual(['configured'])
    })

    it('configuredProviders 只返回主进程标记为已配置的服务商', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'a', name: 'A', category: 'llm', is_preset: 1, api_key: 'sk-1', is_configured: true },
          { id: 'b', name: 'B', category: 'llm', is_preset: 1, api_key: '' },
          { id: 'c', name: 'C', category: 'tts', is_preset: 0, api_key: 'sk-3', is_configured: true },
        ],
      })
      await crud.loadProviders()
      expect(crud.configuredProviders.value).toHaveLength(2)
      expect(crud.configuredProviders.value.map(p => p.id)).toEqual(['a', 'c'])
    })

    it('本地免 Key 服务商以主进程的 is_configured 状态显示为已配置', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [{ id: 'piper', name: 'Piper', category: 'tts', is_preset: true, is_configured: true, api_key_masked: '' }],
      })

      await crud.loadProviders()

      expect(crud.configuredProviders.value.map(p => p.id)).toEqual(['piper'])
      expect(crud.configuredCount.value).toBe(1)
    })

    it('unconfiguredPresets 只返回未配置的预设', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'a', name: 'A', category: 'llm', is_preset: 1, api_key: 'sk-1', is_configured: true },
          { id: 'b', name: 'B', category: 'llm', is_preset: 1, api_key: '' },
          { id: 'c', name: 'C', category: 'tts', is_preset: 0, api_key: '' },
        ],
      })
      await crud.loadProviders()
      expect(crud.unconfiguredPresets.value).toHaveLength(1)
      expect(crud.unconfiguredPresets.value[0].id).toBe('b')
    })

    it('customProviders 只返回非预设的', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'a', name: 'A', category: 'llm', is_preset: 1, api_key: 'sk-1', is_configured: true },
          { id: 'custom', name: 'Custom', category: 'llm', is_preset: 0, api_key: 'sk-c', is_configured: true },
        ],
      })
      await crud.loadProviders()
      expect(crud.customProviders.value).toHaveLength(1)
      expect(crud.customProviders.value[0].id).toBe('custom')
    })

    it('filteredProviders 在 configured 模式下只返回已配置的', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'a', name: 'A', category: 'llm', is_preset: 1, api_key: 'sk-1', is_configured: true },
          { id: 'b', name: 'B', category: 'llm', is_preset: 1, api_key: '' },
        ],
      })
      await crud.loadProviders()
      crud.viewMode.value = 'configured'
      expect(crud.filteredProviders.value).toHaveLength(1)
      expect(crud.filteredProviders.value[0].id).toBe('a')
      crud.viewMode.value = 'all'
      expect(crud.filteredProviders.value).toHaveLength(2)
    })

    it('configuredCategoryCounts 按类别统计已配置的', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'a', name: 'A', category: 'llm', is_preset: 1, api_key: 'sk-1', is_configured: true },
          { id: 'b', name: 'B', category: 'tts', is_preset: 1, api_key: 'sk-2', is_configured: true },
          { id: 'c', name: 'C', category: 'tts', is_preset: 1, api_key: '' },
        ],
      })
      await crud.loadProviders()
      expect(crud.configuredCategoryCounts.value).toEqual({ all: 2, llm: 1, tts: 1 })
    })

    it('activeCategoryCounts 随当前视图显示对应的类别计数', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'a', name: 'A', category: 'llm', is_preset: 1, is_configured: true, api_key_masked: 'sk-***' },
          { id: 'b', name: 'B', category: 'tts', is_preset: 1, api_key_masked: '' },
        ],
      })
      await crud.loadProviders()

      expect(crud.activeCategoryCounts.value).toEqual({ all: 1, llm: 1 })
      crud.viewMode.value = 'all'
      expect(crud.activeCategoryCounts.value).toEqual({ all: 2, llm: 1, tts: 1 })
    })

    it('presetCount 统计全部预设数量', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'a', name: 'A', category: 'llm', is_preset: 1, api_key: 'sk-1', is_configured: true },
          { id: 'b', name: 'B', category: 'llm', is_preset: 0, api_key: 'sk-2', is_configured: true },
          { id: 'c', name: 'C', category: 'tts', is_preset: 1, api_key: '' },
        ],
      })
      await crud.loadProviders()
      expect(crud.presetCount.value).toBe(2)
    })
  })

  // ─── 回归测试：composable 导出完整性 ──────────────────────
  describe('composable 导出完整性（防止模板解构遗漏）', function () {
    it('必须导出所有模板中使用的属性和方法', function () {
      // 此列表从 ModelProviders.vue 的 script setup 解构中提取
      const expectedExports = [
        // 常量
        'CATEGORY_OPTIONS', 'CATEGORY_LABELS', 'MULTIMODAL_CAPABILITY_LABELS',
        // 数据状态
        'providers', 'loading', 'submitting', 'filterCategory', 'viewMode',
        'testResults', 'testingId', 'safeStorageAvailable', 'preferMultimodal',
        // 表单状态
        'showFormDialog', 'isEditing', 'form',
        // 删除状态
        'showDeleteDialog', 'deleteTarget',
        // 新增对话框
        'showAddDialog', 'addStep', 'addCategory', 'addPresetId',
        'availablePresets', 'isCustomAdd',
        // 计算属性
        'configuredProviders', 'unconfiguredPresets', 'customProviders',
        'filteredProviders', 'configuredCount', 'presetCount',
        'categoryCounts', 'configuredCategoryCounts', 'activeCategoryCounts',
        'isMiniMaxMultimodal',
        // 方法
        'loadProviders', 'loadMultimodalPreference', 'saveMultimodalPreference',
        'openAdd', 'nextAddStep', 'loadAvailablePresets',
        'selectPreset', 'selectCustom', 'openEdit',
        'submitForm', 'confirmDelete', 'doDelete',
        'toggleEnabled', 'setDefault', 'testProvider',
      ]

      for (const key of expectedExports) {
        expect(crud).toHaveProperty(key)
        expect(crud[key]).toBeDefined()
      }
    })

    it('viewMode 默认为 configured', function () {
      expect(crud.viewMode.value).toBe('configured')
    })

    it('configuredProviders 初始为空数组（mock 返回空）', function () {
      expect(crud.configuredProviders.value).toEqual([])
    })

    it('unconfiguredPresets 初始为空数组', function () {
      expect(crud.unconfiguredPresets.value).toEqual([])
    })

    it('customProviders 初始为空数组', function () {
      expect(crud.customProviders.value).toEqual([])
    })

    it('presetCount 初始为 0', function () {
      expect(crud.presetCount.value).toBe(0)
    })

    it('configuredCategoryCounts 初始为 { all: 0 }', function () {
      expect(crud.configuredCategoryCounts.value).toEqual({ all: 0 })
    })

    // ─── 多模态模型类别与优先开关 ────────────────────────────
    it('CATEGORY_OPTIONS 包含多模态模型类别与本地化标签', function () {
      const option = crud.CATEGORY_OPTIONS.value.find(opt => opt.value === 'multimodal')
      expect(option).toBeDefined()
      expect(option.label).toBe('多模态模型')
      expect(crud.CATEGORY_LABELS.value.multimodal).toBe('多模态模型')
      expect(crud.MULTIMODAL_CAPABILITY_LABELS.value.tts).toBe('TTS语音')
      // en 语言下标签切换为英文
      i18n.global.locale.value = 'en'
      expect(crud.CATEGORY_LABELS.value.multimodal).toBe('Multimodal Models')
    })

    it('preferMultimodal 默认开启（true）', function () {
      expect(crud.preferMultimodal.value).toBe(true)
    })

    it('loadMultimodalPreference 读取已保存开关（false 生效）', async function () {
      const publisher = await import('@/api/publisher')
      publisher.storeGetSetting.mockResolvedValueOnce({ code: 0, data: false })
      await crud.loadMultimodalPreference()
      expect(publisher.storeGetSetting).toHaveBeenCalledWith('prefer_multimodal')
      expect(crud.preferMultimodal.value).toBe(false)
    })

    it('loadMultimodalPreference 无保存值时默认开启', async function () {
      const publisher = await import('@/api/publisher')
      publisher.storeGetSetting.mockResolvedValueOnce({ code: 0, data: null })
      await crud.loadMultimodalPreference()
      expect(crud.preferMultimodal.value).toBe(true)
    })

    it('saveMultimodalPreference 持久化开关', async function () {
      const publisher = await import('@/api/publisher')
      await crud.saveMultimodalPreference(false)
      expect(publisher.storeSetSetting).toHaveBeenCalledWith('prefer_multimodal', false)
      expect(crud.preferMultimodal.value).toBe(false)
    })
  })
  })
  describe('多模态「支持生成视频」开关（默认关闭）', function () {
    it('默认关闭（false）', function () {
      expect(crud.multimodalVideoEnabled.value).toBe(false)
    })
    it('set true/false 写入 form.config.capability_enabled.video', function () {
      crud.form.value = { config: {} }
      crud.multimodalVideoEnabled.value = true
      expect(crud.form.value.config.capability_enabled.video).toBe(true)
      expect(crud.multimodalVideoEnabled.value).toBe(true)
      crud.multimodalVideoEnabled.value = false
      expect(crud.form.value.config.capability_enabled.video).toBe(false)
    })
    it('读取已有配置的开关状态', function () {
      crud.form.value = { config: { capability_enabled: { video: true } } }
      expect(crud.multimodalVideoEnabled.value).toBe(true)
    })
    it('selectPreset 新建 minimax-multimodal 时默认 capability_enabled.video=false', async function () {
      const { modelProviderPresets } = await import('@/api/model-providers')
      modelProviderPresets.mockResolvedValueOnce({ code: 0, data: [{ id: 'minimax-multimodal', name: 'MiniMax', category: 'multimodal', base_url: 'x', models: [], capabilities: ['llm', 'tts', 'image', 'video'], capability_models: {} }] })
      crud.addCategory.value = 'multimodal'
      await crud.loadAvailablePresets()
      crud.selectPreset('minimax-multimodal')
      expect(crud.form.value.config.capability_enabled.video).toBe(false)
      expect(crud.multimodalVideoEnabled.value).toBe(false)
    })

    it('isMiniMaxMultimodal：minimax-multimodal 为 true，其它服务商为 false（模型列表只读分支）', async function () {
      const { modelProviderPresets } = await import('@/api/model-providers')
      modelProviderPresets.mockResolvedValueOnce({ code: 0, data: [{ id: 'minimax-multimodal', name: 'MiniMax', category: 'multimodal', base_url: 'x', models: [], capabilities: ['llm', 'tts', 'image', 'video'], capability_models: {} }] })
      crud.addCategory.value = 'multimodal'
      await crud.loadAvailablePresets()
      crud.selectPreset('minimax-multimodal')
      expect(crud.isMiniMaxMultimodal.value).toBe(true)

      // 编辑非 MiniMax 多模态服务商 → false（仍渲染模型列表输入框）
      crud.openEdit({ id: 'openai', name: 'OpenAI', category: 'multimodal', models: ['gpt-4o'], config: {} })
      expect(crud.isMiniMaxMultimodal.value).toBe(false)

      // 编辑 MiniMax 多模态服务商 → true（模型列表只读，不渲染输入框）
      crud.openEdit({
        id: 'minimax-multimodal', name: 'MiniMax', category: 'multimodal',
        models: [], modelsText: '', config: {},
      })
      expect(crud.isMiniMaxMultimodal.value).toBe(true)
    })

    it('导出完整性：multimodalVideoEnabled 可访问', function () {
      expect('value' in crud.multimodalVideoEnabled).toBe(true)
    })
    it('编辑 MiniMax 多模态时提交 config 携带 capability_enabled.video', async function () {
      const { modelProviderUpdate } = await import('@/api/model-providers')
      crud.form.value = {
        id: 'minimax-multimodal', name: 'MiniMax', category: 'multimodal',
        base_url: 'https://api.minimaxi.com/v1', models: [], modelsText: '', config: {},
      }
      crud.isEditing.value = true
      crud.multimodalVideoEnabled.value = true
      await crud.submitForm()
      expect(modelProviderUpdate).toHaveBeenCalled()
      const [id, data] = modelProviderUpdate.mock.calls[0]
      expect(id).toBe('minimax-multimodal')
      expect(data.config.capability_enabled.video).toBe(true)
    })
  })
})
