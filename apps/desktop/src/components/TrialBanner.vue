<template>
  <div v-if="showBanner" class="trial-banner" :class="type">
    <div class="banner-content">
      <span v-if="isTrial" class="banner-icon">🎁</span>
      <span v-else class="banner-icon">🔒</span>
      <div class="banner-text">
        <template v-if="isTrial">
          试用期还剩 <strong>{{ daysRemaining }}</strong> 天，<strong>{{ daysRemaining }}</strong> 天后恢复免费版功能
        </template>
        <template v-else>
          当前为免费版，部分功能受限
        </template>
      </div>
      <button class="banner-btn" @click="$emit('upgrade')">
        {{ isTrial ? '立即购买' : '升级 Pro' }}
      </button>
      <button class="banner-close" @click="$emit('dismiss')">✕</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue"
import { useLicenseStore } from "@/stores/license"

const props = defineProps({
  dismissed: { type: Boolean, default: false },
})

defineEmits(["upgrade", "dismiss"])

const store = useLicenseStore()

const isTrial = computed(() => store.isTrial)
const isFree = computed(() => store.isFree)
const daysRemaining = computed(() => store.daysRemaining)
const showBanner = computed(() => (isTrial.value || isFree.value) && !props.dismissed)
const type = computed(() => isTrial.value ? "trial" : "free")
</script>

<style scoped>
.trial-banner {
  padding: 10px 16px;
  border-radius: 10px;
  margin-bottom: var(--space-md);
}
.trial-banner.trial {
  background: #fef3c7;
  border: 1px solid #fbbf24;
}
.trial-banner.free {
  background: #f3f0ff;
  border: 1px solid #c4b5fd;
}

/* 深色模式覆盖（P4 2026-10-08）：.trial-banner.free 的 #f3f0ff 硬编码浅紫底
 * 暗色下不变，与 var(--text-primary)（暗色 #e8e8ed 浅字）组合成 1.09:1
 * 「浅字压浅底」（实测见研究方案 §3.3/§8）。暗色改用品牌紫半透明底 +
 * 暗色文字，与 tokens.css --color-primary-light 暗色变体同口径。 */
[data-theme='dark'] .trial-banner.free {
  background: rgba(123, 116, 255, .18);
  border-color: #7b74ff;
}
[data-theme='dark'] .banner-text {
  color: var(--color-text-primary);
}
[data-theme='dark'] .banner-icon {
  color: var(--color-text-primary);
}
.banner-content {
  display: flex;
  align-items: center;
  gap: 10px;
}
.banner-icon {
  font-size: var(--font-size-lg);
}
.banner-text {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}
.banner-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 6px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  background: var(--coral, #f56c6c);
  color: #fff;
  white-space: nowrap;
}
.banner-btn:hover {
  opacity: 0.9;
}
.banner-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--muted);
  padding: 2px 4px;
}
</style>
