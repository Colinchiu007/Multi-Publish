<template>
  <div ref="root" class="identity-menu">
    <button
      id="identity-menu-trigger"
      ref="trigger"
      data-testid="identity-trigger"
      class="identity-trigger"
      type="button"
      :aria-expanded="open"
      aria-controls="identity-menu-panel"
      aria-haspopup="menu"
      :aria-busy="loading"
      @click="toggleMenu"
      @keydown.down.prevent="openAndFocusFirst"
    >
      <span class="identity-avatar" aria-hidden="true">{{ initials }}</span>
      <span class="identity-trigger-label">{{ displayName }}</span>
      <span class="identity-chevron" aria-hidden="true">⌄</span>
    </button>
    <span class="identity-status-live" aria-live="polite" aria-atomic="true">{{ statusLabel }}</span>

    <div
      v-if="open"
      id="identity-menu-panel"
      ref="panel"
      class="identity-menu-panel"
      role="menu"
      aria-labelledby="identity-menu-trigger"
      @keydown="handleMenuKeydown"
    >
      <div class="identity-menu-heading">
        <strong>{{ hasSessionIdentity ? displayName : 'Multi-Publish' }}</strong>
        <span>{{ statusLabel }}</span>
      </div>
      <button
        v-if="!hasSessionIdentity && !isSigningOut && status !== 'disabled'"
        data-testid="identity-sign-in"
        class="identity-menu-action identity-menu-action-primary"
        type="button"
        role="menuitem"
        :disabled="loading"
        @click="handleSignIn"
      >
        {{ loading ? '正在打开登录...' : '登录 Multi-Publish' }}
      </button>
      <button
        v-if="hasSessionIdentity && !isSigningOut"
        data-testid="identity-switch-account"
        class="identity-menu-action"
        type="button"
        role="menuitem"
        :disabled="loading"
        @click="handleSwitchAccount"
      >
        {{ pendingAction === 'switch' ? '正在切换...' : '切换账号' }}
      </button>
      <button
        v-if="hasSessionIdentity || isSigningOut"
        data-testid="identity-sign-out"
        class="identity-menu-action"
        type="button"
        role="menuitem"
        :disabled="loading"
        @click="handleSignOut"
      >
        {{ pendingAction === 'sign-out' || isSigningOut ? '正在退出...' : '退出登录' }}
      </button>
      <p v-if="status === 'disabled'" class="identity-menu-note">身份服务未启用</p>
      <p v-if="errorMessage" class="identity-menu-error" role="alert">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useIdentity } from '@/composables/useIdentity'

const root = ref(null)
const trigger = ref(null)
const panel = ref(null)
const open = ref(false)
const { status, user, displayName, loading, error, signIn, switchAccount, signOut } = useIdentity()
const isSigningOut = computed(() => status.value === 'signing_out')
const hasSessionIdentity = computed(() => Boolean(user.value?.sub) && !['disabled', 'signed_out', 'expired'].includes(status.value))
const pendingAction = ref(null)

const initials = computed(() => Array.from(displayName.value || '登')[0].toUpperCase())
const statusLabel = computed(() => {
  if (status.value === 'authenticated') return '已连接'
  if (status.value === 'offline_authenticated') return '离线模式'
  if (status.value === 'refreshing') return '刷新中'
  if (status.value === 'signing_in') return '登录中'
  if (status.value === 'expired') return '会话已过期'
  if (status.value === 'error') return hasSessionIdentity.value ? '仍保持登录' : '需要重试'
  if (isSigningOut.value) return '退出中'
  return '未登录'
})
const errorMessage = computed(() => {
  if (status.value === 'disabled') return ''
  const code = error.value?.code
  if (!code) return ''
  const messages = {
    IDENTITY_API_UNAVAILABLE: '当前运行环境未连接身份服务。',
    IDENTITY_CALLBACK_TIMEOUT: '登录等待超时，请重新尝试。',
    IDENTITY_SESSION_EXPIRED: '登录会话已过期，请重新登录。',
    IDENTITY_SIGN_OUT_FAILED: '退出失败，当前登录仍然有效。',
    IDENTITY_SESSION_CLEAR_FAILED: '本地登录信息未能清理，请重试退出。',
  }
  return messages[code] || '登录暂时不可用，请稍后重试。'
})

async function handleSignIn() {
  const ok = await signIn()
  if (ok) open.value = false
}

async function handleSignOut() {
  pendingAction.value = 'sign-out'
  try {
    const ok = await signOut()
    if (ok) open.value = false
  } finally {
    pendingAction.value = null
  }
}

async function handleSwitchAccount() {
  pendingAction.value = 'switch'
  try {
    const ok = await switchAccount()
    if (ok) open.value = false
  } finally {
    pendingAction.value = null
  }
}

async function toggleMenu() {
  if (open.value) {
    open.value = false
    return
  }
  await openAndFocusFirst()
}

async function openAndFocusFirst() {
  open.value = true
  await nextTick()
  panel.value?.querySelector('[role="menuitem"]')?.focus()
}

function handleOutsideClick(event) {
  if (open.value && root.value && !root.value.contains(event.target)) open.value = false
}

function handleKeydown(event) {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  open.value = false
  trigger.value?.focus()
}

function handleMenuKeydown(event) {
  if (event.key === 'Tab') {
    open.value = false
    return
  }
  if (event.key === 'Escape') {
    handleKeydown(event)
    return
  }
  const items = Array.from(panel.value?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])
  if (items.length === 0) return
  const currentIndex = items.indexOf(document.activeElement)
  let nextIndex = currentIndex
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
  else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = items.length - 1
  else return
  event.preventDefault()
  items[nextIndex].focus()
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  document.removeEventListener('keydown', handleKeydown)
})

</script>

<style scoped>
.identity-menu { position: relative; min-width: 0; max-width: 180px; }
.identity-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 3px 8px 3px 4px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  color: var(--ink);
  background: var(--surface);
  cursor: pointer;
  max-width: 100%;
}
.identity-trigger:hover, .identity-trigger[aria-expanded="true"] { border-color: var(--primary); }
.identity-avatar {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--on-primary);
  background: var(--primary);
  font-size: 12px;
  font-weight: 700;
}
.identity-trigger-label { min-width: 0; max-width: 120px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.identity-chevron { color: var(--text-muted); font-size: 14px; line-height: 1; }
.identity-menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 130;
  box-sizing: border-box;
  width: min(220px, calc(100vw - 24px));
  padding: 12px;
  border: 1px solid var(--card-border);
  border-radius: var(--r-sm);
  background: var(--surface);
  box-shadow: 0 12px 32px rgba(30, 27, 75, 0.14);
}
.identity-menu-heading { display: grid; gap: 2px; padding-bottom: 10px; border-bottom: 1px solid var(--hairline); }
.identity-menu-heading strong { min-width: 0; overflow-wrap: anywhere; }
.identity-menu-heading span, .identity-menu-note { color: var(--text-muted); font-size: 12px; }
.identity-menu-action { width: 100%; margin-top: 10px; padding: 8px 10px; border: 1px solid var(--card-border); border-radius: var(--r-xs); background: var(--surface); color: var(--ink); cursor: pointer; text-align: left; }
.identity-menu-action-primary { border-color: var(--primary); color: var(--primary); }
.identity-menu-action:disabled { cursor: wait; opacity: 0.6; }
.identity-menu-note, .identity-menu-error { margin: 10px 0 0; }
.identity-menu-error { color: var(--error); font-size: 12px; }
.identity-status-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
