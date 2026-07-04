<template>
  <div class="upgrade-overlay" @click.self="('close')">
    <div class="upgrade-modal">
      <div class="modal-header">
        <span style="font-weight:600;font-size:16px">🚀 升级 Pro 版</span>
        <button class="cohere-btn-ghost" @click="('close')" style="font-size:12px;padding:2px 6px">✕</button>
      </div>

      <div class="modal-body">
        <div class="plan-card free-card" :class="{ active: licenseType === 'free' }">
          <div class="plan-name">免费版</div>
          <div class="plan-price">¥0</div>
          <ul class="feature-list">
            <li>✓ 单平台发布</li>
            <li>✓ 基础平台支持</li>
            <li>✗ 批量发布</li>
            <li>✗ 定时发布</li>
            <li>✗ 内容模板</li>
            <li>✗ 数据分析</li>
          </ul>
          <div v-if="licenseType === 'free'" class="plan-badge current">当前方案</div>
        </div>

        <div class="plan-card pro-card" :class="{ active: isPro }">
          <div class="plan-name">Pro 版</div>
          <div class="plan-price">¥99 <span style="font-size:12px;color:var(--muted)">/永久</span></div>
          <ul class="feature-list">
            <li>✓ 全平台发布</li>
            <li>✓ 批量发布</li>
            <li>✓ 定时发布</li>
            <li>✓ 内容模板</li>
            <li>✓ AI 辅助写作</li>
            <li>✓ 数据分析看板</li>
            <li>✓ API 开放平台</li>
          </ul>
          <div v-if="isPro" class="plan-badge active">已激活</div>
          <button v-else class="upgrade-btn" @click="startUpgrade">立即升级</button>
        </div>
      </div>

      <!-- Upgrade flow -->
      <div v-if="showUpgradeFlow" class="upgrade-flow">
        <div class="cohere-divider"></div>
        <div style="padding:var(--space-md)">
          <div style="font-weight:600;font-size:14px;margin-bottom:var(--space-sm)">输入激活码</div>
          <div style="display:flex;gap:8px;margin-bottom:var(--space-md)">
            <input
              v-model="licenseKey"
              class="upgrade-input"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-family:monospace;font-size:14px;outline:none"
              @keyup.enter="doActivate"
            />
            <button class="upgrade-btn" @click="doActivate" :disabled="activating">
              {{ activating ? '验证中...' : '激活' }}
            </button>
          </div>
          <div v-if="activateError" style="color:var(--coral);font-size:13px;margin-bottom:var(--space-sm)">
            {{ activateError }}
          </div>
          <div v-if="activateSuccess" style="color:var(--success);font-size:13px;margin-bottom:var(--space-sm)">
            ✅ 激活成功！
          </div>
          <div class="cohere-divider"></div>
          <div style="text-align:center;padding:var(--space-sm)">
            <button class="cohere-btn-ghost" @click="doTrial" :disabled="trialLoading" style="font-size:13px;color:var(--coral)">
              {{ trialLoading ? '激活中...' : '🎁 免费试用 7 天' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="isPro && showUpgradeFlow" class="modal-footer">
        <button class="cohere-btn-ghost" @click="doDeactivate" style="font-size:12px;color:var(--coral)">注销许可证</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { useLicenseStore } from "@/stores/license"

const emit = defineEmits(["close"])

const store = useLicenseStore()
const showUpgradeFlow = ref(false)
const licenseKey = ref("")
const activating = ref(false)
const trialLoading = ref(false)
const activateError = ref("")
const activateSuccess = ref(false)

const licenseType = computed(() => store.licenseType)
const isPro = computed(() => store.isPro)

async function startUpgrade() {
  showUpgradeFlow.value = true
  activateError.value = ""
  activateSuccess.value = false
}

async function doActivate() {
  if (!licenseKey.value.trim()) {
    activateError.value = "请输入激活码"
    return
  }
  activating.value = true
  activateError.value = ""
  activateSuccess.value = false
  const ok = await store.activate(licenseKey.value.trim())
  activating.value = false
  if (ok) {
    activateSuccess.value = true
  } else {
    activateError.value = "激活码无效或已被使用"
  }
}

async function doTrial() {
  trialLoading.value = true
  const ok = await store.activateTrial()
  trialLoading.value = false
  if (ok) {
    activateSuccess.value = true
  } else {
    activateError.value = "试用激活失败"
  }
}

async function doDeactivate() {
  await store.deactivate()
  showUpgradeFlow.value = false
}

onMounted(async () => {
  await store.load()
})
</script>

<style scoped>
.upgrade-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.upgrade-modal {
  background: var(--surface, #fff);
  border-radius: 16px;
  width: 640px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border);
}
.modal-body {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-lg);
}
.plan-card {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: var(--space-md);
  position: relative;
  transition: all 0.2s;
}
.plan-card.active {
  border-color: var(--coral);
  box-shadow: 0 0 0 1px var(--coral);
}
.plan-name {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 4px;
}
.plan-price {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: var(--space-sm);
}
.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 13px;
  line-height: 2;
}
.feature-list li {
  color: var(--text-primary);
}
.plan-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  margin-top: var(--space-sm);
}
.plan-badge.current {
  background: var(--soft-stone);
  color: var(--muted);
}
.plan-badge.active {
  background: var(--success-bg, #d1fae5);
  color: var(--success, #059669);
}
.upgrade-btn {
  width: 100%;
  padding: 8px;
  background: var(--coral, #f56c6c);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  margin-top: var(--space-sm);
  transition: opacity 0.15s;
}
.upgrade-btn:hover { opacity: 0.9; }
.upgrade-btn:disabled { opacity: 0.5; cursor: default; }
.upgrade-flow {
  padding: 0 var(--space-lg) var(--space-lg);
}
.upgrade-input:focus {
  border-color: var(--coral) !important;
}
.modal-footer {
  padding: var(--space-sm) var(--space-lg);
  text-align: center;
}
</style>
