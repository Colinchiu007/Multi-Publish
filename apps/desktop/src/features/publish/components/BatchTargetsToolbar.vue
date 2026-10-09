<template>
  <!-- 批量设置发布目标：N 条选题 × M 平台逐条勾选是 O(N×M) 次点击（5×8=40 次），
       故提供「一次表达 → 应用到全部条目」的入口。只列有账号的平台（无账号平台勾了也过不了校验）。 -->
  <div class="cohere-card cohere-card-static batch-targets-toolbar" data-testid="batch-targets-toolbar">
    <div class="batch-toolbar-row">
      <span class="cohere-form-label no-margin-bottom">{{ t('publishPage.batchTargets.title') }}</span>
      <span class="batch-toolbar-hint">{{ t('publishPage.batchTargets.hint') }}</span>
    </div>
    <div class="batch-platform-targets">
      <label v-for="p in platformOptions" :key="'toolbar-' + p.id" class="batch-platform-option">
        <input type="checkbox" :value="p.id" :checked="modelValue.includes(p.id)" class="coral-check" @change="togglePlatform(p.id)" />
        {{ p.label }}
      </label>
    </div>
    <div class="batch-toolbar-row">
      <UiButton
        data-testid="batch-targets-apply-all"
        variant="secondary"
        size="sm"
        :disabled="modelValue.length === 0 || articleCount === 0"
        @click="emit('apply-all')"
      >{{ t('publishPage.batchTargets.applyAll') }}</UiButton>
      <span class="batch-toolbar-hint">{{ t('publishPage.batchTargets.applyAllHint') }}</span>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/UiButton.vue'

const props = defineProps({
  /** 可发布平台（有账号的平台） */
  platformOptions: { type: Array, default: () => [] },
  /** 已勾选平台 id（v-model） */
  modelValue: { type: Array, default: () => [] },
  /** 批量条目数（0 时禁用「应用到全部」） */
  articleCount: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue', 'apply-all'])
const { t } = useI18n()

function togglePlatform (platformId) {
  const next = props.modelValue.includes(platformId)
    ? props.modelValue.filter(id => id !== platformId)
    : [...props.modelValue, platformId]
  emit('update:modelValue', next)
}
</script>

<style scoped>
.batch-targets-toolbar { display: flex; flex-direction: column; gap: var(--space-sm); }
.batch-toolbar-row { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
.batch-toolbar-hint { font-size: var(--font-size-xs); color: var(--muted); }
</style>
