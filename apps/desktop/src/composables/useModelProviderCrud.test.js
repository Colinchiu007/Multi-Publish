// @ts-check
/**
 * useModelProviderCrud.test.js — 模型服务商 CRUD 测试
 *
 * 回归测试：修复 "An object could not be cloned" IPC 序列化错误
 * 根因：Vue ref 嵌套对象是 reactive proxy，直接传给 ipcRenderer.invoke() 会报错
 * 修复：submitForm 中用 JSON.parse(JSON.stringify()) 脱壳
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
} from '@/api/model-providers'

describe('useModelProviderCrud', function () {
  let crud

  beforeEach(function () {
    crud = useModelProviderCrud()
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

    it('form.config 为 reactive proxy 时也能安全传递', async function () {
      // 模拟 Vue ref 包装后的 config 是 proxy
      crud.form.value = {
        id: 'test-provider',
        name: 'Test',
        category: 'llm',
        base_url: '',
        api_key: '',
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
        api_key: '',
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

    it('filteredProviders 按类别过滤', async function () {
      modelProviderList.mockResolvedValueOnce({
        code: 0,
        data: [
          { id: 'a', name: 'A', category: 'llm' },
          { id: 'b', name: 'B', category: 'tts' },
        ],
      })
      await crud.loadProviders()

      crud.filterCategory.value = 'llm'
      expect(crud.filteredProviders.value).toHaveLength(1)
      expect(crud.filteredProviders.value[0].id).toBe('a')
    })

    it('submitForm 名称为空时显示警告', async function () {
      crud.form.value = { ...crud.form.value, name: '', id: '' }
      await crud.submitForm()
      expect(modelProviderCreate).not.toHaveBeenCalled()
    })
  })
})
