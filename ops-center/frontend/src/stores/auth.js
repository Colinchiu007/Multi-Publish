import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

/**
 * 客户端预检 token 是否已过期（仅用于启动时避免"半登录态"）。
 * 只做 exp 过期判断；缺失 exp 或解析失败分别按"交由后端判定/视为无效"处理。
 * 后端仍是权威校验（HS256 验签 + exp），此处只是 UX 提前拦截。
 */
export function isTokenExpired(token) {
  try {
    const part = token.split('.')[1]
    if (!part) return true
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    if (typeof payload.exp !== 'number') return false
    return payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const username = ref('')
  const role = ref('')
  const initialized = ref(false)

  const isLoggedIn = computed(() => !!token.value)

  function init() {
    const saved = localStorage.getItem('ops_token')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.token && !isTokenExpired(data.token)) {
          token.value = data.token || ''
          username.value = data.username || ''
          role.value = data.role || ''
        } else {
          localStorage.removeItem('ops_token')
        }
      } catch {
        localStorage.removeItem('ops_token')
      }
    }
    initialized.value = true
  }

  async function login(user, pwd) {
    // ops-center 本地管理员登录（自包含，不依赖 orchestrator）
    const res = await axios.post('/api/auth/login', { username: user, password: pwd })
    const data = res.data
    token.value = data.access_token || data.token
    username.value = data.username || user
    role.value = data.role || 'user'

    const saved = JSON.stringify({ token: token.value, username: username.value, role: role.value })
    localStorage.setItem('ops_token', saved)

    // Set Axios default header
    axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
    return data
  }

  function logout() {
    token.value = ''
    username.value = ''
    role.value = ''
    localStorage.removeItem('ops_token')
    delete axios.defaults.headers.common['Authorization']
  }

  // Init axios header if token exists
  init()
  if (token.value) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
  }

  return { token, username, role, initialized, isLoggedIn, init, login, logout }
})
