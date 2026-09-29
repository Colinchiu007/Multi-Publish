<template>
  <section class="batch-article-fields" :data-testid="`batch-fields-${index}`">
    <div class="batch-article-fields__title">{{ t('publishPage.batchFieldSurface.sectionTitle') }}</div>

    <!-- 无标题平台首行提示：按**本条目**所选平台计算（不是页面全局 selectedPlatforms）。
         漏这行时用户会以为「填了标题各平台就有标题」，而实际发布链路把标题插进描述首行。 -->
    <p v-if="noTitleHint" class="no-title-hint" :data-testid="`batch-no-title-hint-${index}`">{{ noTitleHint }}</p>

    <!-- 封面（P2-7 四个命名面之一；此前 cover_* 在批量条目里只有读点、没有写点，恒为空） -->
    <div class="cohere-form-item">
      <label class="cohere-form-label">
        {{ t('publishPage.cover') }}
        <span
          v-if="coverSupportText"
          class="field-support-badge"
          :data-testid="`batch-field-support-cover-${index}`"
        >{{ coverSupportText }}</span>
      </label>
      <div class="batch-cover-row">
        <el-upload
          class="publish-media-upload"
          :auto-upload="false"
          :limit="1"
          :show-file-list="false"
          accept="image/*"
          :on-change="handleCoverFileChange"
        >
          <button type="button" class="media-upload-trigger">{{ t('publishPage.selectCover') }}</button>
        </el-upload>
        <CoverThumbnail
          :data-url="coverPreview.dataUrl.value"
          :error="coverPreview.error.value"
          :loading="coverPreview.loading.value"
          @open="openPreview"
        />
        <UiButton
          v-if="article.cover_path || article.cover_url"
          variant="ghost"
          size="sm"
          :data-testid="`batch-clear-cover-${index}`"
          @click="emit('clear-cover')"
        >
          {{ t('publishPage.batchFieldSurface.clearCover') }}
        </UiButton>
        <!-- 状态投影：测试断言「条目级封面写点」用，不参与视觉 -->
        <div
          :data-testid="`batch-cover-state-${index}`"
          :data-cover-path="article.cover_path || ''"
          :data-cover-url="article.cover_url || ''"
          hidden
        ></div>
      </div>
      <UiInput
        :model-value="article.cover_url"
        :placeholder="t('publishPage.coverUrlPlaceholder')"
        class="stack-gap-top"
        :data-testid="`batch-cover-url-${index}`"
        @update:model-value="value => emit('update:cover-url', value)"
      />
      <p class="batch-field-hint">{{ t('publishPage.batchFieldSurface.coverHint') }}</p>
    </div>

    <!-- 可见性语义档位 + 平台差异化内容：两者都依赖「本篇所选平台」，
         平台清单为空时不出面板（不得渲染一张空面板让用户以为设置已生效）。 -->
    <template v-if="platformIds.length > 0">
      <div v-if="visibilitySupportedIds.length > 0" class="cohere-form-item">
        <PublishVisibilitySelect
          :model-value="article.visibilitySemantic || ''"
          :platforms="visibilitySupportedIds"
          :hint="visibilityHint"
          @update:model-value="value => emit('update:visibility', value)"
        />
      </div>
      <div class="cohere-form-item">
        <button class="publish-section-toggle" type="button" :data-testid="`batch-diff-toggle-${index}`" @click="showDiff = !showDiff">
          <span>{{ t('publishPage.diffContent') }}</span>
          <span class="publish-section-toggle__state">{{ showDiff ? t('publishPage.collapse') : t('publishPage.expand') }}</span>
        </button>
        <p class="batch-field-hint">{{ t('publishPage.batchFieldSurface.diffHint') }}</p>
        <PlatformOverridePanel
          v-if="showDiff"
          :platforms="overrideSpecs"
          :model-value="article.platformOverrides || {}"
          @update:model-value="next => emit('update:overrides', next)"
        />
      </div>
    </template>
    <p v-else class="batch-field-hint" :data-testid="`batch-no-platform-hint-${index}`">
      {{ t('publishPage.batchFieldSurface.noPlatformHint') }}
    </p>
  </section>
</template>

<script setup>
/**
 * BatchArticleFields.vue — 批量模式每篇文章的扩展字段面（P2-7）
 *
 * 哑组件：不持有 store、不自行改写条目对象，所有写入经 emit 冒泡到 useBatchPublish 的
 * setter，使「UI 写点」与「payload 构造点」同侧，被同一条键集 parity 回归锁覆盖。
 * 判据（支持度徽标 / 无标题提示 / 可见性支持清单 / 差异化面板规格）全部来自
 * usePublishFieldSurface 共用实现——与单篇同一份，两模式不可能口径漂移。
 */
import { computed, ref } from 'vue'
import i18n from '@/i18n'
import UiInput from '@/components/UiInput.vue'
import UiButton from '@/components/UiButton.vue'
import CoverThumbnail from '@/components/CoverThumbnail.vue'
import PlatformOverridePanel from '@/features/publish/components/PlatformOverridePanel.vue'
import PublishVisibilitySelect from '@/features/publish/components/PublishVisibilitySelect.vue'
import { useCoverPreview } from '@/composables/useCoverPreview'
import { useNotify } from '@/composables/useNotify'
import { normalizeUploadFile } from '@/features/publish/publish-upload-file'
import { usePublishFieldSurface } from '@/features/publish/usePublishFieldSurface'

const props = defineProps({
  /** 批量条目对象（只读消费；写入一律经 emit） */
  article: { type: Object, required: true },
  /** 条目在列表中的下标（testid 定位用） */
  index: { type: Number, default: 0 },
  /** 平台目录 [{id, label}]，与页面平台清单同源 */
  platformCatalog: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'update:cover',
  'update:cover-url',
  'update:visibility',
  'update:overrides',
  'clear-cover',
  'open-preview',
])

const { notifyWarning } = useNotify()
const t = (key, params) => i18n.global.t(key, params)
const surface = usePublishFieldSurface()

const platformIds = computed(() => (Array.isArray(props.article.platforms) ? props.article.platforms : []))
const noTitleHint = computed(() => surface.noTitleHintFor(platformIds.value))
const coverSupportText = computed(() => surface.fieldSupportText('cover'))
const visibilitySupportedIds = computed(() => surface.visibilitySupportedIdsFor(platformIds.value))
const visibilityHint = computed(() => surface.visibilityUnsupportedHintFor(platformIds.value, props.article.visibilitySemantic))
const overrideSpecs = computed(() => surface.overridePlatformSpecsFor(props.platformCatalog, platformIds.value))

// 预览挂在该条目的 cover_path 上（与单篇同一结论：挂字段才不会漏接线——封面有多个写入口）
const coverPreview = useCoverPreview(() => props.article.cover_path)

const showDiff = ref(false)

function openPreview () {
  if (!coverPreview.dataUrl.value) return
  emit('open-preview', { dataUrl: coverPreview.dataUrl.value, path: props.article.cover_path })
}

async function handleCoverFileChange (file) {
  const descriptor = await normalizeUploadFile(file)
  if (!descriptor) {
    // 解析失败必须出声：静默返回会把「没拿到路径」伪装成「用户清空了封面」
    notifyWarning('story2video.media_path_unresolved', { params: { kindLabel: t('publishPage.cover') } })
    return
  }
  emit('update:cover', descriptor)
}
</script>

<style scoped>
.batch-article-fields {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-light, #e0e0e0);
}
.batch-article-fields__title {
  font-size: var(--font-size-xs);
  color: var(--muted, #8a8f98);
  letter-spacing: 0.02em;
}
.batch-cover-row { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.batch-field-hint { margin: 0; font-size: var(--font-size-xs); color: var(--muted, #8a8f98); }
.no-title-hint {
  margin: 0;
  padding: 6px 8px;
  font-size: var(--font-size-xs);
  color: var(--warning-text, #8a5a00);
  background: var(--warning-soft, #fff7e6);
  border-left: 3px solid var(--warning, #f59e0b);
}
.field-support-badge {
  margin-left: 6px;
  font-size: var(--font-size-xs);
  color: var(--muted, #8a8f98);
}
.publish-section-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid var(--border-light, #e0e0e0);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: var(--font-size-sm);
  color: var(--text-primary, #202124);
  cursor: pointer;
}
.publish-section-toggle__state { color: var(--muted, #8a8f98); font-size: var(--font-size-xs); }
</style>
