<template>
  <div v-if="platforms.length > 0" class="visibility-select" data-testid="publish-visibility">
    <label class="visibility-select__label" for="publish-visibility-select">
      {{ t('publishPage.visibility') }}
      <span class="visibility-select__badge">{{ t('publishPage.visibilitySupport', { count: platforms.length }) }}</span>
    </label>
    <select
      id="publish-visibility-select"
      class="visibility-select__control"
      data-testid="publish-visibility-select"
      :value="modelValue"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
    <span
      v-if="hint"
      class="visibility-select__hint"
      data-testid="publish-visibility-hint"
    >{{ hint }}</span>
    <span v-else class="visibility-select__hint" data-testid="publish-visibility-hint">{{ t('publishPage.visibilityHint') }}</span>
  </div>
</template>

<script setup>
/**
 * P1-5 语义级可见性通用控件（发布页通用区）。
 *
 * 5 个平台的可见性字段名与取值各不相同（YouTube privacy / TikTok privacyLevel /
 * 抖音 visibilityType / 快手 visibilityType / 微博 visible）。本控件只暴露**语义档位**
 * （公开 / 好友 / 私密 / 跟随默认），映射到各平台值的真源是注册表 semanticValues，
 * 由主进程 resolver 按平台消费（本组件不持有任何平台取值映射表）。
 *
 * 哑组件：平台清单与「不支持档位」提示由页面注入（Publish.vue 持有 store/标签解析），
 * 组件本身只用 i18n 渲染四个档位标签。
 */
import { computed } from 'vue'
import i18n from '@/i18n'

const props = defineProps({
  /** 当前语义档位：'' | 'public' | 'friends' | 'private' */
  modelValue: { type: String, default: '' },
  /** 所选平台中支持 visibility 语义的平台 id 清单（空则整块不渲染） */
  platforms: { type: Array, default: () => [] },
  /** 「当前档位在部分平台无对应值」提示（页面计算，含平台名）；空则显示通用说明 */
  hint: { type: String, default: '' },
})

defineEmits(['update:modelValue'])

const t = (key, params) => i18n.global.t(key, params)

const options = computed(() => [
  { value: '', label: t('publishPage.visibilityDefault') },
  { value: 'public', label: t('publishPage.visibilityPublic') },
  { value: 'friends', label: t('publishPage.visibilityFriends') },
  { value: 'private', label: t('publishPage.visibilityPrivate') },
])
</script>

<style scoped>
.visibility-select { display: grid; gap: 6px; }
.visibility-select__label { display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); color: var(--text-primary, #202124); }
.visibility-select__badge { color: var(--muted, #8a8f98); font-size: var(--font-size-xs); }
.visibility-select__control { max-width: 260px; border: 1px solid var(--border-light, #e0e0e0); border-radius: 6px; padding: 6px 8px; font-size: var(--font-size-sm); color: var(--text-primary, #202124); background: var(--surface, #fff); }
.visibility-select__hint { color: var(--muted, #8a8f98); font-size: var(--font-size-xs); }
</style>
