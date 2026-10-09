<script setup>
/**
 * FilmEngineeringHubView — 影视工程三标签 Hub（自动 / 画布 / 工程案例）
 *
 * 结构契约（openspec change: film-auto-mode，design D1/D2/D24）：
 *   - 三个面板 v-show 常驻 + **懒挂载**（首次进入才挂载），切换不丢状态；
 *   - 标签与 URL query `?tab=auto|canvas|classic` 双向绑定，缺省 auto，切换用 router.replace；
 *   - **不引入路由重定向**：`/film-engineering/classic` 仍是非 redirect 直达路由（避免削弱
 *     useTabDocumentTitle 的「非 redirect 路由数」棘轮，见 design D24）；
 *   - 两个既有视图以 embedded=true 内嵌（默认 false 时行为逐字不变，见各自 prop 契约）。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import FilmAutoPanel from './film-auto/FilmAutoPanel.vue'
import FilmCanvasView from './FilmCanvasView.vue'
import FilmEngineeringView from './FilmEngineeringView.vue'

const TABS = Object.freeze(['auto', 'canvas', 'classic'])
const DEFAULT_TAB = 'auto'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

function normalizeTab (value) {
  const v = String(value == null ? '' : value)
  return TABS.includes(v) ? v : DEFAULT_TAB
}

const activeTab = ref(normalizeTab(route.query && route.query.tab))
/** 已挂载过的标签（懒挂载；切换后不销毁 → 不丢进度/画布状态） */
const mountedTabs = ref(new Set([activeTab.value]))

const tabItems = computed(() => TABS.map((id) => ({
  id,
  label: t('filmEngineering.hub.tabs.' + id),
  hint: t('filmEngineering.hub.hints.' + id),
})))

function isMounted (id) { return mountedTabs.value.has(id) }

function selectTab (id) {
  const next = normalizeTab(id)
  if (next === activeTab.value) return
  activeTab.value = next
  mountedTabs.value = new Set([...mountedTabs.value, next])
  const current = normalizeTab(route.query && route.query.tab)
  if (current !== next) {
    router.replace({ path: '/film-engineering', query: { tab: next } })
  }
}

/** 标签键盘导航（ARIA tab 模式：←/→ 循环、Home/End 首尾） */
function onTabKeydown (event, index) {
  const key = event && event.key
  let target = null
  if (key === 'ArrowRight') target = TABS[(index + 1) % TABS.length]
  else if (key === 'ArrowLeft') target = TABS[(index - 1 + TABS.length) % TABS.length]
  else if (key === 'Home') target = TABS[0]
  else if (key === 'End') target = TABS[TABS.length - 1]
  if (!target) return
  event.preventDefault()
  selectTab(target)
}

watch(() => (route.query && route.query.tab), (value) => {
  const next = normalizeTab(value)
  if (next === activeTab.value) return
  activeTab.value = next
  mountedTabs.value = new Set([...mountedTabs.value, next])
})
</script>

<template>
  <div class="film-hub-view" data-testid="film-hub">
    <header class="fh-header">
      <h1 class="fh-title">{{ t('filmEngineering.hub.title') }}</h1>
      <p class="fh-subtitle">{{ t('filmEngineering.hub.subtitle') }}</p>
    </header>

    <div class="fh-tabs" role="tablist" :aria-label="t('filmEngineering.hub.tabsLabel')">
      <button
        v-for="(item, index) in tabItems"
        :key="item.id"
        type="button"
        role="tab"
        :id="'fh-tab-' + item.id"
        :class="['fh-tab', { active: activeTab === item.id }]"
        :aria-selected="activeTab === item.id"
        :aria-controls="'fh-panel-' + item.id"
        :tabindex="activeTab === item.id ? 0 : -1"
        :title="item.hint"
        :data-testid="'fh-tab-' + item.id"
        @click="selectTab(item.id)"
        @keydown="onTabKeydown($event, index)"
      >{{ item.label }}</button>
    </div>

    <div
      class="fh-panels"
      :id="'fh-panel-auto'"
      role="tabpanel"
      aria-labelledby="fh-tab-auto"
      v-show="activeTab === 'auto'"
      data-testid="fh-panel-auto"
    >
      <FilmAutoPanel v-if="isMounted('auto')" />
    </div>

    <div
      class="fh-panels fh-panels-canvas"
      :id="'fh-panel-canvas'"
      role="tabpanel"
      aria-labelledby="fh-tab-canvas"
      v-show="activeTab === 'canvas'"
      data-testid="fh-panel-canvas"
    >
      <FilmCanvasView v-if="isMounted('canvas')" :embedded="true" @open-classic="selectTab('classic')" />
    </div>

    <div
      class="fh-panels"
      :id="'fh-panel-classic'"
      role="tabpanel"
      aria-labelledby="fh-tab-classic"
      v-show="activeTab === 'classic'"
      data-testid="fh-panel-classic"
    >
      <FilmEngineeringView v-if="isMounted('classic')" :embedded="true" />
    </div>
  </div>
</template>

<style scoped>
.film-hub-view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.fh-header { padding: 16px 24px 0; }
.fh-title { margin: 0; font-size: var(--font-size-lg, 20px); font-weight: 600; }
.fh-subtitle { margin: 4px 0 0; color: var(--el-text-color-secondary, #909399); font-size: var(--font-size-sm, 13px); }
.fh-tabs { display: flex; gap: 4px; margin: 16px 24px 0; padding: 4px; background: var(--surface, #f8f9fa); border: 1px solid var(--hairline, rgba(0, 0, 0, 0.06)); border-radius: var(--radius-md, 10px); }
.fh-tab { flex: 1 1 0; min-width: 0; appearance: none; border: 0; background: transparent; cursor: pointer; padding: 8px 12px; border-radius: var(--radius-sm, 8px); font-size: var(--font-size-sm, 13px); color: var(--el-text-color-regular, #606266); transition: background-color .15s ease, color .15s ease; }
.fh-tab:hover:not(.active) { color: var(--text, #303133); background: var(--bg, rgba(0, 0, 0, 0.03)); }
.fh-tab:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.fh-tab.active { background: var(--color-primary); color: #fff; font-weight: 600; }
.fh-panels { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.fh-panels-canvas { min-height: 60vh; }
@media (max-width: 900px) {
  .fh-tabs { overflow-x: auto; }
  .fh-tab { flex: 1 0 auto; }
}
</style>
