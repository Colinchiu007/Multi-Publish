import { createApiClient } from './http'

const api = createApiClient()

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
