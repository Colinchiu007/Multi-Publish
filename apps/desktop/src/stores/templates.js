/**
 * Templates Store — Pinia
 * Manages content templates state for the frontend
 */
import { defineStore } from "pinia"
import { ref, computed } from "vue"

const getApi = () => window.electronAPI || null

export const useTemplateStore = defineStore("templates", () => {
  const templates = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function load() {
    const api = getApi()
    if (!api) return
    loading.value = true
    error.value = null
    try {
      const res = await api.templateList()
      if (res && res.code === 0) {
        templates.value = res.data || []
      } else {
        templates.value = []
      }
    } catch (e) {
      error.value = e.message
      templates.value = []
    } finally {
      loading.value = false
    }
  }

  async function add(tpl) {
    const api = getApi()
    if (!api) return null
    try {
      const res = await api.templateAdd(tpl)
      if (res && res.code === 0) {
        templates.value.push(res.data)
        return res.data
      }
      return null
    } catch (e) {
      error.value = e.message
      return null
    }
  }

  async function update(id, updates) {
    const api = getApi()
    if (!api) return null
    try {
      const res = await api.templateUpdate(id, updates)
      if (res && res.code === 0) {
        const idx = templates.value.findIndex((t) => t.id === id)
        if (idx >= 0) templates.value[idx] = res.data
        return res.data
      }
      return null
    } catch (e) {
      error.value = e.message
      return null
    }
  }

  async function remove(id) {
    const api = getApi()
    if (!api) return false
    try {
      const res = await api.templateDelete(id)
      if (res && res.code === 0) {
        templates.value = templates.value.filter((t) => t.id !== id)
        return true
      }
      return false
    } catch (e) {
      error.value = e.message
      return false
    }
  }

  const byCategory = computed(() => {
    const map = {}
    for (const t of templates.value) {
      const cat = t.category || "other"
      if (!map[cat]) map[cat] = []
      map[cat].push(t)
    }
    return map
  })

  const categories = computed(() => Object.keys(byCategory.value))

  return {
    templates,
    loading,
    error,
    load,
    add,
    update,
    remove,
    byCategory,
    categories,
  }
})
