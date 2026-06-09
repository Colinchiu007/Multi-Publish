import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue')
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
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router