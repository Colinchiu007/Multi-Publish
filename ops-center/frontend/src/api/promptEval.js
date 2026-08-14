import { createApiClient } from './http'

const api = createApiClient()

export function createPromptEvalCase(data) {
  return api.post('/prompt-eval/cases', data).then(r => r.data)
}

export function translatePromptEvalCase(caseId) {
  return api.post(`/prompt-eval/cases/${caseId}/translate`).then(r => r.data)
}

export function createPromptEvalRun(caseId) {
  return api.post(`/prompt-eval/cases/${caseId}/runs`).then(r => r.data)
}

export function getPromptEvalRun(runId) {
  return api.get(`/prompt-eval/runs/${runId}`).then(r => r.data)
}

export function listPromptEvalCases(limit = 50) {
  return api.get('/prompt-eval/cases', { params: { limit } }).then(r => r.data)
}

export function getPromptEvalCase(caseId) {
  return api.get(`/prompt-eval/cases/${caseId}`).then(r => r.data)
}

export function updatePromptEvalCase(caseId, data) {
  return api.put(`/prompt-eval/cases/${caseId}`, data).then(r => r.data)
}

export function deletePromptEvalCase(caseId) {
  return api.delete(`/prompt-eval/cases/${caseId}`).then(r => r.data)
}

export function getPromptEvalSummary() {
  return api.get('/prompt-eval/summary').then(r => r.data)
}

export function getPromptEvalEngineStatus() {
  return api.get('/prompt-eval/engine/status').then(r => r.data)
}

export function listPromptEvalProviders() {
  return api.get('/prompt-eval/providers').then(r => r.data)
}

export function upsertPromptEvalProvider(data) {
  return api.put('/prompt-eval/providers', data).then(r => r.data)
}

export function testPromptEvalProvider(data) {
  return api.post('/prompt-eval/providers/test', data).then(r => r.data)
}

export function mediaUrl(name) {
  return `/api/v1/prompt-eval/media/${encodeURIComponent(name)}`
}


export function createPromptEvalSceneCase(data) {
  return api.post('/prompt-eval/cases', data).then(r => r.data)
}

export function listPromptEvalCaseRuns(caseId) {
  return api.get(`/prompt-eval/cases/${caseId}/runs`).then(r => r.data)
}

export function translatePromptEvalScene(caseId, sceneId) {
  return api.post(`/prompt-eval/cases/${caseId}/scenes/${sceneId}/translate`).then(r => r.data)
}

export function createPromptEvalSceneRun(caseId, sceneId) {
  return api.post(`/prompt-eval/cases/${caseId}/scenes/${sceneId}/runs`).then(r => r.data)
}
