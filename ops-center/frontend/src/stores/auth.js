import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

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
        token.value = data.token || ''
        username.value = data.username || ''
        role.value = data.role || ''
      } catch {}
    }
    initialized.value = true
  }

  async function login(user, pwd) {
    // Use orchestrator SSO for auth
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
