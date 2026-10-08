<template>
  <div class="member-center-view" data-testid="member-center-view">
    <!-- 页面头部 -->
    <div class="cohere-page-header">
      <div>
        <div class="page-title" data-testid="member-center-title">{{ t('memberCenter.title') }}</div>
        <div class="page-subtitle">{{ t('memberCenter.subtitle') }}</div>
      </div>
      <div class="page-actions">
        <button
          v-if="!hasSessionIdentity && status !== 'disabled'"
          class="cohere-btn-primary"
          data-testid="member-center-login"
          :disabled="loading"
          @click="handleSignIn"
        >
          {{ loading ? t('memberCenter.signingIn') : t('memberCenter.login') }}
        </button>
        <button
          v-if="showUpgradeCta"
          class="cohere-btn-primary"
          data-testid="member-center-upgrade"
          @click="showUpgrade = true"
        >
          {{ t('memberCenter.upgradePro') }}
        </button>
      </div>
    </div>

    <!-- 身份服务未启用 -->
    <div v-if="status === 'disabled'" class="cohere-content member-center-single">
      <section class="member-center-card">
        <div class="member-center-disabled-title">{{ t('memberCenter.identityDisabled') }}</div>
        <p class="member-center-empty-hint">{{ t('memberCenter.identityDisabledHint') }}</p>
      </section>
    </div>

    <!-- 未登录空态 -->
    <div v-else-if="!hasSessionIdentity" class="cohere-content member-center-single">
      <section class="member-center-card member-center-empty" data-testid="member-center-empty">
        <div class="member-center-empty-icon" aria-hidden="true"><el-icon><Medal /></el-icon></div>
        <div class="member-center-empty-title">{{ t('memberCenter.notLoggedIn') }}</div>
        <p class="member-center-empty-hint">{{ t('memberCenter.notLoggedInHint') }}</p>
        <button class="cohere-btn-primary" :disabled="loading" @click="handleSignIn">
          {{ loading ? t('memberCenter.signingIn') : t('memberCenter.login') }}
        </button>
      </section>
    </div>

    <!-- 已登录：左侧七栏导航 + 右侧子视图 -->
    <div v-else class="cohere-content member-center-layout">
      <nav class="member-center-nav" data-testid="member-center-nav" aria-label="member-center">
        <button
          v-for="section in MEMBER_SECTIONS"
          :key="section.key"
          class="member-center-nav-item"
          :class="{ 'is-active': section.key === activeKey }"
          :data-testid="`member-center-nav-${section.key}`"
          type="button"
          @click="activate(section.key)"
        >
          <span class="member-center-nav-label">{{ t(section.navKey) }}</span>
          <span
            v-if="section.key === 'messages' && memberStore.unreadCount > 0"
            class="member-center-nav-badge"
            data-testid="member-center-nav-messages-badge"
          >{{ memberStore.unreadCount }}</span>
        </button>
      </nav>

      <div class="member-center-main" :data-testid="`member-center-${activeKey}`">
        <!--
          价目目录（2026-10-07）：数据来自服务端 GET /api/v1/plans，随权益同步一并取，
          经 `identity:state-changed` 推送到 `identityStore.plans`。
          `plan-matrix.js` 是定价唯一真源——此前的金额是营销文档里手写的。

          三态刻意区分，**不做硬编码兜底**：
            plans === null            → 取价失败或未取到（显示「暂不可用」，不显示空目录）
            plans.length === 0        → 服务端确实没有配置套餐
            有数据                    → 显示真实价格
          购买入口仍保持关闭（见 UpgradeModal 的 paymentChannelUnavailable）。
        -->
        <section
          class="member-center-plans"
          data-testid="member-center-plans"
          :aria-busy="plansLoading"
        >
          <h3 class="member-center-plans-title">{{ t('memberCenter.plansTitle') }}</h3>
          <p v-if="plans === null" class="member-center-plans-unavailable" data-testid="plans-unavailable">
            {{ t('memberCenter.plansUnavailable') }}
          </p>
          <p v-else-if="plans.length === 0" class="member-center-plans-unavailable" data-testid="plans-empty">
            {{ t('memberCenter.plansEmpty') }}
          </p>
          <ul v-else class="member-center-plans-list">
            <li
              v-for="plan in plans"
              :key="plan.id"
              class="member-center-plan"
              :class="{ 'is-current': plan.id === currentPlanId }"
              :data-testid="`plan-${plan.id}`"
            >
              <span class="member-center-plan-label">
                {{ plan.id === currentPlanId ? t('memberCenter.planCurrentSuffix', { label: plan.label }) : plan.label }}
              </span>
              <span class="member-center-plan-price" :data-testid="`plan-${plan.id}-price`">
                <template v-if="plan.priceMonthlyCents === 0">{{ t('memberCenter.planFree') }}</template>
                <template v-else>
                  {{ formatPrice(plan.priceMonthlyCents, plan.currency) }} / {{ t('memberCenter.perMonth') }}
                  <span class="member-center-plan-yearly">
                    · {{ formatPrice(plan.priceYearlyCents, plan.currency) }} / {{ t('memberCenter.perYear') }}
                  </span>
                </template>
              </span>
            </li>
          </ul>
        </section>
        <div v-if="errorMessage" class="member-center-error-box">
          <p class="member-center-error" role="alert">{{ errorMessage }}</p>
          <IdentityDiagnostics />
        </div>
        <component :is="activeView" />
      </div>
    </div>

    <UpgradeModal v-if="showUpgrade" @close="showUpgrade = false" />
  </div>
</template>

<script setup>
import { Medal } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentity } from '@/composables/useIdentity'
import { useIdentityStore } from '@/stores/identity'
import { useLicenseStore } from '@/stores/license'
import { useMemberStore } from '@/stores/member'
import { resolveIdentityErrorMessageKey } from '@/utils/identity-error-messages'
import IdentityDiagnostics from '@/components/IdentityDiagnostics.vue'
import UpgradeModal from '@/components/UpgradeModal.vue'
import { MEMBER_VIEWS } from './member-center/views'

// 七栏信息架构（§4 A 布局）。导航结构由壳层自身持有（不随子视图 mock 变化），
// MEMBER_VIEWS 仅提供 key->组件 的注册表，测试可安全替换后者。
const MEMBER_SECTIONS = [
  { key: 'overview', name: 'Overview', navKey: 'memberCenter.navOverview' },
  { key: 'account', name: 'AccountSecurity', navKey: 'memberCenter.navAccount' },
  { key: 'subscription', name: 'Subscription', navKey: 'memberCenter.navSubscription' },
  { key: 'orders', name: 'OrdersBilling', navKey: 'memberCenter.navOrders' },
  { key: 'usage', name: 'UsageQuota', navKey: 'memberCenter.navUsage' },
  { key: 'messages', name: 'Messages', navKey: 'memberCenter.navMessages' },
  { key: 'help', name: 'HelpSupport', navKey: 'memberCenter.navHelp' },
]

const { t } = useI18n()
const identityStore = useIdentityStore()
const licenseStore = useLicenseStore()
const memberStore = useMemberStore()
const { status, user, loading, error, signIn, switchAccount, signOut } = useIdentity()

const showUpgrade = ref(false)
const activeKey = ref('overview')

const hasSessionIdentity = computed(() => Boolean(user.value?.sub) && !['disabled', 'signed_out', 'expired'].includes(status.value))
const entitlement = computed(() => identityStore.entitlement)
// 价目目录（2026-10-07）：来自服务端 /api/v1/plans，null = 未取到/取价失败。
// **不提供硬编码兜底**——取不到就显示「暂不可用」，绝不拿记忆里的金额冒充。
const plans = computed(() => identityStore.plans)
const plansLoading = computed(() => status.value === 'signing_in' || status.value === 'refreshing')
const currentPlanId = computed(() => (entitlement.value && entitlement.value.plan) || 'free')

// 服务端价格单位是**分**（整数，无浮点误差），这里才做除法。
// 仅用于展示，不参与任何计算或比较。
function formatPrice(cents, currency) {
  if (!Number.isInteger(cents)) return '—'
  const symbol = currency === 'CNY' ? '¥' : currency + ' '
  return symbol + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)
}
// A2 单一真源：登录且有服务端权益快照时，升级 CTA 以 entitlement.plan 为准，不再读本地 licenseStore。
const showUpgradeCta = computed(() => {
  if (!hasSessionIdentity.value) return false
  if (entitlement.value) return entitlement.value.plan !== 'pro'
  return !licenseStore.isPro
})
const activeSection = computed(() => MEMBER_SECTIONS.find((s) => s.key === activeKey.value) || MEMBER_SECTIONS[0])
const activeView = computed(() => MEMBER_VIEWS[activeSection.value.name])
const errorMessage = computed(() => {
  const entry = error.value
  if (!entry?.code) return ''
  const primary = t(resolveIdentityErrorMessageKey(entry.code))
  const cleanupCode = entry.cleanup?.code
  if (!cleanupCode) return primary
  const secondary = t(resolveIdentityErrorMessageKey(cleanupCode))
  return secondary === primary ? primary : `${primary} ${secondary}`
})

function activate(key) {
  activeKey.value = key
  if (key === 'messages') memberStore.loadNotifications()
  else if (key === 'account') memberStore.loadSessions()
}

async function handleSignIn() {
  await signIn()
}

// 账号操作透传给子视图（AccountSecurity）复用，壳层保留引用避免重复实现。
defineExpose({ status, user, identityStore, licenseStore, memberStore, switchAccount, signOut })
// identityStore 引用便于子视图共享同一 pinia 单例的调试。
void identityStore
</script>
