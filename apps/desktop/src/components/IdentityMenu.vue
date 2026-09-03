<template>
  <div class="identity-menu" ref="menuRef">
    <button
      class="identity-trigger"
      :class="{ 'is-open': open, 'is-authenticated': isAuthenticated }"
      :disabled="status === 'disabled'"
      @click="open = !open"
      :aria-label="triggerLabel"
      data-testid="identity-menu-trigger"
    >
      <span class="identity-avatar" aria-hidden="true">{{ avatarChar }}</span>
      <span class="identity-label" v-if="!compact">{{ displayName }}</span>
      <span class="identity-chevron" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" class="identity-dropdown" data-testid="identity-menu-dropdown">
      <div class="identity-header">
        <span class="identity-user-name">{{ user?.name || user?.email || '访客' }}</span>
        <span class="identity-user-email" v-if="user?.email">{{ user.email }}</span>
      </div>

      <div class="identity-status" :class="'status-' + status">
        <span class="status-dot" aria-hidden="true"></span>
        <span>{{ statusLabel }}</span>
      </div>

      <div v-if="errorMessage" class="identity-error" data-testid="identity-error">
        {{ errorMessage }}
      </div>

      <div class="identity-actions">
        <button
          v-if="!isAuthenticated"
          class="identity-btn identity-btn-signin"
          :disabled="status === 'signing_in' || isSigningOut"
          @click="handleSignIn"
          data-testid="identity-signin-btn"
        >
          {{ status === 'signing_in' ? '登录中…' : '登录' }}
        </button>

        <button
          v-if="isAuthenticated"
          class="identity-btn identity-btn-signout"
          :disabled="isSigningOut"
          @click="handleSignOut"
          data-testid="identity-signout-btn"
        >
          {{ isSigningOut ? '退出中…' : '退出登录' }}
        </button>

        <button
          v-if="isAuthenticated"
          class="identity-btn identity-btn-switch"
          :disabled="isSigningOut"
          @click="handleSwitchAccount"
          data-testid="identity-switch-btn"
        >
          切换账号
        </button>

        <button
          v-if="isAuthenticated"
          class="identity-btn identity-btn-member"
          @click="goMemberCenter"
          data-testid="identity-member-btn"
        >
          会员中心
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIdentityStore } from '@/stores/identity'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  compact: { type: Boolean, default: false },
})

const { t } = useI18n()
const router = useRouter()
const store = useIdentityStore()
const {
  user, status, error, hasSessionIdentity,
  isAuthenticated, isSigningOut,
  load, signIn, signOut, switchAccount, dispose,
} = store

const open = ref(false)
const pendingAction = ref(null)
const menuRef = ref(null)

onMounted(() => {
  load()
  document.addEventListener('click', onClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
  dispose()
})

function onClickOutside(event) {
  if (menuRef.value && !menuRef.value.contains(event.target)) {
    open.value = false
  }
}

watch(open, (val) => {
  if (!val) pendingAction.value = null
})

const avatarChar = computed(() => {
  if (user.value?.name) return user.value.name[0].toUpperCase()
  if (user.value?.email) return user.value.email[0].toUpperCase()
  return '?'
})

const displayName = computed(() => {
  if (user.value?.name) return user.value.name
  if (user.value?.email) return user.value.email.split('@')[0]
  return '访客'
})

const triggerLabel = computed(() => {
  if (isAuthenticated.value) return displayName.value + '，已登录'
  return '未登录，点击登录'
})

const statusLabel = computed(() => {
  if (status.value === 'disabled') return '服务不可用'
  if (status.value === 'signed_out') return '未登录'
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
    IDENTITY_NOT_CONFIGURED: '身份服务未配置，请在设置中配置 Logto 连接信息。',
    IDENTITY_CONFIG_INVALID: '身份服务配置无效，请检查设置。',
    IDENTITY_OPERATION_FAILED: '身份服务操作失败，请稍后重试。',
    IDENTITY_LOAD_FAILED: '无法加载身份信息，请检查网络连接。',
    IDENTITY_SIGN_IN_FAILED: '登录失败，请确认身份服务配置正确后重试。',
    IDENTITY_ACCOUNT_SWITCH_FAILED: '切换账号失败，请重试。',
    IDENTITY_CALLBACK_TIMEOUT: '登录等待超时，请重新尝试。',
    IDENTITY_SESSION_EXPIRED: '登录会话已过期，请重新登录。',
    IDENTITY_SIGN_OUT_FAILED: '退出失败，当前登录仍然有效。',
    IDENTITY_SESSION_CLEAR_FAILED: '本地登录信息未能清理，请重试退出。',
  }
  return messages[code] || '登录暂时不可用，请稍后重试。'
})

function goMemberCenter() {
  open.value = false
  router.push('/member-center')
}

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
</script>

<style scoped>
.identity-menu {
  position: relative;
  display: inline-flex;
}

.identity-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--hairline);
  border-radius: var(--r-pill);
  background: var(--canvas);
  cursor: pointer;
  font-size: 13px;
  color: var(--ink);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.identity-trigger:hover {
  border-color: var(--primary);
}

.identity-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.identity-trigger.is-open {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-light);
}

.identity-trigger.is-authenticated {
  background: var(--primary-light);
  border-color: var(--primary);
}

.identity-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 12px;
  font-weight: 600;
}

.identity-label {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-chevron {
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.15s;
}

.identity-trigger.is-open .identity-chevron {
  transform: rotate(180deg);
}

.identity-dropdown {
  position: absolute;
  top: calc(100% + var(--space-xs));
  right: 0;
  min-width: 240px;
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  padding: var(--space-md);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.identity-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.identity-user-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.identity-user-email {
  font-size: 12px;
  color: var(--text-muted);
}

.identity-status {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 12px;
  color: var(--text-muted);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-light);
  flex-shrink: 0;
}

.status-authenticated .status-dot { background: var(--success); }
.status-signing_in .status-dot { background: var(--warning); animation: pulse 1s infinite; }
.status-error .status-dot { background: var(--error); }
.status-expired .status-dot { background: var(--warning); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.identity-error {
  font-size: 12px;
  color: var(--error);
  padding: var(--space-xs) var(--space-sm);
  background: var(--coral-soft);
  border-radius: var(--r-xs);
  line-height: 1.4;
}

.identity-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.identity-btn {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background: var(--canvas);
  cursor: pointer;
  font-size: 13px;
  color: var(--ink);
  transition: background 0.15s;
  text-align: center;
}

.identity-btn:hover {
  background: var(--soft-stone);
}

.identity-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.identity-btn-signin {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.identity-btn-signin:hover {
  background: var(--primary-hover);
}

.identity-btn-signout {
  color: var(--error);
}
</style>