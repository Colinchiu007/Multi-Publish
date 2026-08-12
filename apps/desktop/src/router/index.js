import { shallowRef } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { reportError } from '../utils/report-error'

export const routeLoadError = shallowRef(null)

export function clearRouteLoadError() {
  routeLoadError.value = null
}

export function setRouteLoadError(error, to) {
  const message = error?.message || String(error)
  routeLoadError.value = {
    title: '页面加载失败',
    message: '页面资源没有成功加载，请重试。',
    details: to?.fullPath ? `${to.fullPath}: ${message}` : message,
    path: to?.fullPath || '',
    errorMessage: message,
  }
}

const routes = [
  { path: '/', name: 'Home', component: () => import('@/views/Home.vue') },
  { path: '/comments', name: 'Comments', component: () => import('@/views/Comments.vue') },
  { path: '/first-run', name: 'FirstRun', component: () => import('@/views/FirstRun.vue') },
  { path: '/publish', name: 'Publish', component: () => import('@/views/Publish.vue') },
  { path: '/publish/history', name: 'PublishHistory', component: () => import('@/views/PublishHistory.vue') },
  { path: '/accounts', name: 'Accounts', component: () => import('@/views/Accounts.vue') },
  { path: '/dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue') },
  { path: '/collection', name: 'Collection', component: () => import('@/views/Collection.vue') },
  { path: '/monitor', name: 'Monitor', component: () => import('@/views/Monitor.vue') },
  { path: '/keywords', name: 'Keywords', component: () => import('@/views/KeywordMonitorView.vue') },
  { path: '/viral-analysis', name: 'ViralAnalysis', component: () => import('@/views/ViralAnalysis.vue') },
  { path: '/providers', redirect: '/model-providers' },
  { path: '/model-providers', name: 'ModelProviders', component: () => import('@/views/ModelProviders.vue') },
  { path: '/create', name: 'Create', component: () => import('@/views/CreateView.vue') },
  { path: '/create/pipeline', redirect: '/create' },
  { path: '/create/result', name: 'CreateResult', component: () => import('@/views/ResultView.vue') },
  { path: '/create/history', name: 'CreateHistory', component: () => import('@/views/CreateHistory.vue') },
  { path: '/cloud-publish', name: 'CloudPublish', component: () => import('@/views/CloudPublish.vue') },
  { path: '/intelligence', name: 'Intelligence', component: () => import('@/views/Intelligence.vue') },
  { path: '/calendar', name: 'Calendar', component: () => import('@/views/Calendar.vue') },
  { path: '/library', name: 'ProjectLibrary', component: () => import('@/views/ProjectLibrary.vue') },
  { path: '/board/:projectId', name: 'ProductionBoard', component: () => import('@/views/ProductionBoard.vue') },
  { path: '/board/:projectId/contact-sheet', name: 'ContactSheetView', component: () => import('@/views/ContactSheetView.vue') },
  { path: '/replay/:projectId', name: 'ReplayTimeline', component: () => import('@/views/ReplayTimeline.vue') },
  { path: '/prompt-eval', name: 'PromptEval', component: () => import('@/views/PromptEvalView.vue') },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.onError((error, to) => {
  reportError('[Router Load Error] ' + (error?.message || String(error)) + ' ' + (to?.fullPath || ''))
  setRouteLoadError(error, to)
})

export default router
