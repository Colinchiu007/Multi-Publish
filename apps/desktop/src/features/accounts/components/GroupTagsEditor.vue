<template>
  <div class="group-tags" :data-testid="`group-tags-${group.id}`">
    <!-- 编辑态：多选 -->
    <template v-if="editing">
      <div class="group-tags-editor">
        <button
          v-for="cat in categories"
          :key="cat.category_key"
          type="button"
          class="tag-toggle"
          :class="{ 'tag-toggle--on': selected.includes(cat.category_key) }"
          :data-testid="`tag-toggle-${group.id}-${cat.category_key}`"
          @click.stop="toggle(cat.category_key)"
        >{{ cat.name }}</button>
        <span v-if="categories.length === 0" class="group-tags-none">{{ $t('collection.tagsNoOptions') }}</span>
      </div>
      <div class="group-tags-actions">
        <button type="button" class="tag-save" :data-testid="`save-group-tags-${group.id}`" @click.stop="save">
          {{ $t('automation.tagsSave') }}
        </button>
        <button type="button" class="tag-cancel" @click.stop="cancel">{{ $t('automation.tagsCancel') }}</button>
      </div>
    </template>

    <!-- 展示态：chips + 编辑入口 -->
    <template v-else>
      <span class="group-tags-label">{{ $t('collection.tagsLabel') }}</span>
      <span
        v-for="key in groupTags(group)"
        :key="key"
        class="group-tag"
        :class="{ 'group-tag--unknown': !isTagKnown(key) }"
        :title="isTagKnown(key) ? tagLabel(key) : $t('collection.tagUnknownHint')"
      >{{ tagLabel(key) }}</span>
      <span v-if="groupTags(group).length === 0" class="group-tags-none">{{ $t('collection.tagsNone') }}</span>
      <button type="button" class="edit-tags-button" :data-testid="`edit-group-tags-${group.id}`" @click.stop="$emit('edit')">
        {{ $t('automation.tagsEdit') }}
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  group: { type: Object, required: true },
  categories: { type: Array, default: () => [] },
  editing: { type: Boolean, default: false },
  /** vue-i18n 的 t 函数（可选）：用于把内置类别名解析为当前语言 */
  translate: { type: Function, default: null },
})
const emit = defineEmits(['edit', 'save', 'cancel'])

/**
 * 分组的类别标签（兼容缺失字段的历史分组）。
 * ⚠️ 分组用 `categoryTags`，采集条目用 `tags` —— 两个字段不能混用，
 * 混用的表现是「标签永远读不到」，且不报错。
 */
function groupTags (group) {
  return Array.isArray(group && group.categoryTags) ? group.categoryTags : []
}

const selected = ref([...groupTags(props.group)])

// 进入编辑态 / 外部 group 变化时重新取基准，避免编辑值与真源漂移
watch(() => [props.editing, props.group], () => {
  selected.value = [...groupTags(props.group)]
}, { deep: true })

function tagLabel (key) {
  const hit = props.categories.find((c) => c && c.category_key === key)
  if (hit && hit.name && hit.name !== key) return hit.name
  // 内置回退名（name === key）：经 i18n 解析当前语言，避免渲染端写死中文
  return props.translate ? props.translate('contentCategories.' + key) : key
}

function isTagKnown (key) {
  return props.categories.some((c) => c && c.category_key === key)
}

function toggle (key) {
  const idx = selected.value.indexOf(key)
  if (idx >= 0) selected.value.splice(idx, 1)
  else selected.value.push(key)
}

function save () {
  emit('save', [...selected.value])
}

function cancel () {
  // 回到真源基准再退出，避免残留编辑值影响下次进入
  selected.value = [...groupTags(props.group)]
  emit('cancel')
}
</script>

<style scoped>
.group-tags {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 8px 14px; border-top: 1px solid #efeff2; font-size: var(--font-size-xs);
}
.group-tags-label { color: var(--muted, #85858f); }
.group-tag {
  padding: 2px 8px; border-radius: 10px; background: var(--soft-stone, #f2f3f5);
  color: #3a3a44;
}
/* 类别已被运营删除：标签保留但置灰，悬停说明原因，且不参与筛选 */
.group-tag--unknown { background: #ececee; color: #a8a8b3; text-decoration: line-through; }
.group-tags-none { color: var(--muted, #b0b0b8); }
.edit-tags-button {
  padding: 2px 8px; border: 1px solid #dcdee3; border-radius: 4px;
  background: #fff; color: var(--color-primary); font-size: var(--font-size-xs); cursor: pointer;
}
.group-tags-editor { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-toggle {
  padding: 3px 10px; border: 1px solid #dcdee3; border-radius: 12px;
  background: #fff; color: #3a3a44; font-size: var(--font-size-xs); cursor: pointer;
}
.tag-toggle--on { border-color: var(--color-primary); color: var(--color-primary); }
.group-tags-actions { display: flex; gap: 6px; width: 100%; margin-top: 6px; }
.tag-save, .tag-cancel {
  padding: 2px 9px; border: 1px solid #dcdee3; border-radius: 4px;
  background: #fff; font-size: var(--font-size-xs); cursor: pointer;
}
.tag-save { border-color: var(--color-primary); color: var(--color-primary); }
</style>
