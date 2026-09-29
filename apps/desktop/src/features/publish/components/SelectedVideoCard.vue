<template>
  <div v-if="path" :key="path" class="selected-video-card" data-testid="video-selected-card">
    <div class="selected-video-card__head">
      <CircleCheckFilled class="selected-video-card__icon" />
      <span class="selected-video-card__title">{{ t('publishPage.videoSelected') }}</span>
      <span class="selected-video-card__spacer"></span>
      <UiButton variant="ghost" size="sm" data-testid="video-card-replace" @click="$emit('replace')">
        {{ t('publishPage.videoCard.replace') }}
      </UiButton>
      <UiButton variant="ghost" size="sm" class="selected-video-card__remove" data-testid="video-card-remove" @click="$emit('remove')">
        {{ t('publishPage.videoCard.remove') }}
      </UiButton>
    </div>
    <div class="selected-video-card__name" :title="descriptor.name" data-testid="video-card-name">{{ descriptor.name }}</div>
    <div class="selected-video-card__meta" data-testid="video-card-meta">
      <span v-if="descriptor.sizeBytes != null">{{ formatBytes(descriptor.sizeBytes) }}</span>
      <span v-else>{{ t('publishPage.videoCard.sizeUnknown') }}</span>
      <span v-if="descriptor.formatLabel" class="selected-video-card__format">{{ descriptor.formatLabel }}</span>
    </div>
    <div class="selected-video-card__hint">{{ t('publishPage.videoCard.hint') }}</div>
  </div>
</template>

<script setup>
// SelectedVideoCard — 视频文件选择后的常驻成功态卡片（PRD-VIDEO-SELECT-FEEDBACK-2026-09-28）。
// 出现即代表 video_path 已登记；替换/移除走父组件（Publish.vue）统一入口，保证与 el-upload 列表同步。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CircleCheckFilled } from '@element-plus/icons-vue'
import UiButton from '@/components/UiButton.vue'
import { formatBytes } from '@/utils/bytes'
import { describeVideoFile } from '@/utils/video-selection-feedback'

const props = defineProps({
  // 已登记的视频绝对路径（空串 = 未选择，卡片不渲染）
  path: { type: String, default: '' },
  // describeVideoFile 输出形态；草稿恢复等无 File 元信息场景为 null，退化为路径推导文件名
  info: { type: Object, default: null },
})

defineEmits(['replace', 'remove'])

const { t } = useI18n()

const descriptor = computed(() => describeVideoFile({
  name: props.info?.name || '',
  path: props.path,
  size: props.info?.sizeBytes,
  type: props.info?.formatLabel ? `video/${String(props.info.formatLabel).toLowerCase()}` : '',
}))
</script>

<style scoped>
.selected-video-card {
  margin-top: 10px;
  padding: 12px 14px;
  border: 1.5px solid var(--success, #67c23a);
  border-left-width: 4px;
  border-radius: 10px;
  background: var(--success-bg, rgba(103, 194, 58, 0.08));
  animation: selected-video-card-in 0.25s ease-out;
}
@keyframes selected-video-card-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.selected-video-card__head { display: flex; align-items: center; gap: 8px; }
.selected-video-card__icon { width: 20px; height: 20px; color: var(--success, #67c23a); flex-shrink: 0; }
.selected-video-card__title { font-size: var(--font-size-md, 14px); font-weight: 600; color: var(--success, #67c23a); }
.selected-video-card__spacer { flex: 1; }
.selected-video-card__remove { color: var(--coral, #f56c6c); }
.selected-video-card__name {
  margin-top: 6px;
  font-size: var(--font-size-md, 14px);
  font-weight: 600;
  color: var(--text-primary, #303133);
  word-break: break-all;
}
.selected-video-card__meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm, 13px);
  color: var(--text-secondary, #606266);
}
.selected-video-card__format {
  padding: 0 6px;
  border-radius: 4px;
  background: var(--success, #67c23a);
  color: #fff;
  font-size: var(--font-size-xs, 12px);
  font-weight: 600;
  line-height: 18px;
}
.selected-video-card__hint {
  margin-top: 6px;
  font-size: var(--font-size-xs, 12px);
  color: var(--muted, #8a8f98);
}
</style>
