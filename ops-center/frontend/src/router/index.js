import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/feature-flags',
    name: 'FeatureFlags',
    component: () => import('../views/FeatureFlags.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/projects',
    name: 'Projects',
    component: () => import('../views/Projects.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/secrets',
    name: 'Secrets',
    component: () => import('../views/Secrets.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/platforms',
    name: 'Platforms',
    component: () => import('../views/Platforms.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/usage',
    name: 'UsageDashboard',
    component: () => import('../views/UsageDashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/system-health',
    name: 'SystemHealth',
    component: () => import('../views/SystemHealth.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/licenses',
    name: 'Licenses',
    component: () => import('../views/Licenses.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/announcements',
    name: 'Announcements',
    component: () => import('../views/Announcements.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/update-policy',
    name: 'UpdatePolicy',
    component: () => import('../views/UpdatePolicy.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/content-policy',
    name: 'ContentPolicy',
    component: () => import('../views/ContentPolicy.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/model-presets',
    name: 'ModelPresets',
    component: () => import('../views/ModelPresets.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/platform-defs',
    name: 'PlatformDefs',
    component: () => import('../views/PlatformDefs.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/parameters',
    name: 'Parameters',
    component: () => import('../views/Parameters.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/snapshots',
    name: 'Snapshots',
    component: () => import('../views/Snapshots.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/env',
    name: 'EnvView',
    component: () => import('../views/EnvView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/audit-log',
    name: 'AuditLog',
    component: () => import('../views/AuditLog.vue'),
    meta: { requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  // Initialize auth from localStorage
  if (!authStore.initialized) {
    authStore.init()
  }

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    next('/login')
  } else if (to.meta.guest && authStore.isLoggedIn) {
    next('/')
  } else {
    next()
  }
})

export default router
