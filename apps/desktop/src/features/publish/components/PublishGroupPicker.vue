<template>
  <!-- items 为空即整块不渲染：CI 像素门禁跑的是空 profile（无分组），
       空态若也渲染就是给 publish 视图制造必然的基线漂移；同时也不给用户一个点不动的死控件。 -->
  <div
    v-if="items.length > 0"
    class="group-picker"
    role="group"
    :aria-label="labelText"
    data-testid="publish-group-picker"
  >
    <span class="group-picker__label">{{ labelText }}</span>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="group-picker__chip"
      :class="{ 'is-empty': item.total === 0 }"
      :disabled="disabled"
      :title="item.name"
      :data-testid="`group-apply-${item.id}`"
      :aria-label="applyLabel(item)"
      @click="$emit('apply-group', item.id)"
    >
      <span class="group-picker__name">{{ item.name }}</span>
      <span class="group-picker__count" :data-testid="`group-apply-count-${item.id}`">{{ item.applicable }}/{{ item.total }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import i18n from '@/i18n'

defineProps({
  /** `buildGroupPickerItems` 的产物：[{id,name,applicable,total}]。组件保持哑组件，不碰 store。 */
  items: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})

defineEmits(['apply-group'])

const labelText = computed(() => i18n.global.t('publishPage.groupPicker.label'))

// 数字是「当前可添加 / 组成员总数」：不相等就说明有点下去加不上的成员，
// 用户不必等通知也能预判；但可添加数为 0 时仍渲染（禁用会把"组里号都停用了"
// 伪装成"按钮坏了"）。
function applyLabel (item) {
  return i18n.global.t('publishPage.groupPicker.applyAria', { name: item.name })
}
</script>

<style scoped>
.group-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.group-picker__label { color: var(--muted, #73777d); font-size: var(--font-size-xs); font-weight: 600; }
.group-picker__chip { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; padding: 3px 9px; border: 1px solid var(--border-light, #e0e0e0); border-radius: 999px; background: var(--surface, #fff); color: var(--text-primary, #202124); font-size: var(--font-size-xs); cursor: pointer; }
.group-picker__chip:hover:not(:disabled) { border-color: var(--action-blue, #1890ff); }
.group-picker__chip:disabled { cursor: not-allowed; opacity: 0.6; }
.group-picker__chip.is-empty { border-style: dashed; }
.group-picker__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-picker__count { color: var(--muted, #8a8f98); }
</style>
