import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use(config => {
  const saved = localStorage.getItem('ops_token')
  if (saved) {
    try {
      const data = JSON.parse(saved)
      if (data.token) config.headers.Authorization = `Bearer ${data.token}`
    } catch {}
  }
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) localStorage.removeItem('ops_token')
    return Promise.reject(err)
  }
)

/** 当前规则（source=db/template；未配置时返回模板基线） */
export function getSceneContextRules() {
  return api.get('/scene-context/rules').then(r => r.data)
}

/** 校验规则 JSON（不落库） */
export function validateSceneContextRules(rules) {
  return api.post('/scene-context/rules/validate', { rules }).then(r => r.data)
}

/** 保存规则（admin），返回最新规则 */
export function saveSceneContextRules(rules) {
  return api.put('/scene-context/rules', { rules }).then(r => r.data)
}

/** 导出规则（含发布指引） */
export function exportSceneContextRules() {
  return api.get('/scene-context/rules/export').then(r => r.data)
}
