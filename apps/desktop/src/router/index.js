import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue')
  },
  {
    path: '/comments',
    name: 'Comments',
    component: () => import('@/views/Comments.vue')
  },
  {
    path: '/first-run',
    name: 'FirstRun',
    component: () => import('@/views/FirstRun.vue')
  },
  {
    path: '/publish',
    name: 'Publish',
    component: () => import('@/views/Publish.vue')
  },
  {
    path: '/accounts',
    name: 'Accounts',
    component: () => import('@/views/Accounts.vue')
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue')
  },
  {
    path: '/collection',
    name: 'Collection',
    component: () => import('@/views/Collection.vue')
  },
  {
    path: '/monitor',
    name: 'Monitor',
    component: () => import('@/views/Monitor.vue')
  },
  {
    path: '/keywords',
    name: 'Keywords',
    component: () => import('@/views/KeywordMonitorView.vue')
  },
  {
    path: '/viral-analysis',
    name: 'ViralAnalysis',
    component: () => import('@/views/ViralAnalysis.vue')
  },
  {
    path: '/providers',
    name: 'Providers',
    component: () => import('@/views/Providers.vue')
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
