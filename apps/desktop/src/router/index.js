import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'Home', component: () => import('@/views/Home.vue') },
  { path: '/comments', name: 'Comments', component: () => import('@/views/Comments.vue') },
  { path: '/first-run', name: 'FirstRun', component: () => import('@/views/FirstRun.vue') },
  { path: '/publish', name: 'Publish', component: () => import('@/views/Publish.vue') },
  { path: '/accounts', name: 'Accounts', component: () => import('@/views/Accounts.vue') },
  { path: '/dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue') },
  { path: '/collection', name: 'Collection', component: () => import('@/views/Collection.vue') },
  { path: '/monitor', name: 'Monitor', component: () => import('@/views/Monitor.vue') },
  { path: '/keywords', name: 'Keywords', component: () => import('@/views/KeywordMonitorView.vue') },
  { path: '/viral-analysis', name: 'ViralAnalysis', component: () => import('@/views/ViralAnalysis.vue') },
  { path: '/providers', redirect: '/model-providers' },
  { path: '/model-providers', name: 'ModelProviders', component: () => import('@/views/ModelProviders.vue') },
  { path: '/create', name: 'Create', component: () => import('@/views/CreateView.vue') },
  { path: '/create/result', name: 'CreateResult', component: () => import('@/views/ResultView.vue') },
  { path: '/create/history', name: 'CreateHistory', component: () => import('@/views/CreateHistory.vue') },
  { path: '/cloud-publish', name: 'CloudPublish', component: () => import('@/views/CloudPublish.vue') },
  { path: '/intelligence', name: 'Intelligence', component: () => import('@/views/Intelligence.vue') },
  { path: '/calendar', name: 'Calendar', component: () => import('@/views/Calendar.vue') },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
