<template>
  <UiModal
    :visible="visible"
    title="设置"
    size="xl"
    width="1100px"
    @close="$emit('close')"
  >
    <div class="settings-dialog-content">
      <!-- 左侧 Tab 导航 -->
      <div class="settings-tabs">
        <button
          v-for="tab in tabs" :key="tab.key"
          class="settings-tab" :class="{ active: activeTab === tab.key, disabled: tab.disabled }"
          :disabled="tab.disabled"
          @click="onTabClick(tab)"
        >
          <span class="tab-label">{{ tab.label }}</span>
          <span v-if="tab.disabled" class="tab-badge">敬请期待</span>
        </button>
      </div>
      <!-- 右侧内容区 -->
      <div class="settings-panel">
        <ModelProviders v-if="activeTab === 'model'" />
        <div v-else class="placeholder-panel">
          <div class="placeholder-icon">🚧</div>
          <p>该功能正在开发中，敬请期待</p>
        </div>
      </div>
    </div>
  </UiModal>
</template>

<script setup>
import { ref } from 'vue'
import UiModal from './UiModal.vue'
import ModelProviders from '@/views/ModelProviders.vue'

defineProps({
  visible: { type: Boolean, default: false },
})
defineEmits(['close'])

const activeTab = ref('model')
const tabs = [
  { key: 'model', label: '模型设置', disabled: false },
  { key: 'general', label: '通用设置', disabled: true },
  { key: 'publish', label: '发布设置', disabled: true },
  { key: 'account', label: '账号设置', disabled: true },
]

function onTabClick (tab) {
  if (tab.disabled) return
  activeTab.value = tab.key
}
</script>

<style scoped>
.settings-dialog-content {
  display: flex;
  min-height: 600px;
  max-height: 70vh;
}

.settings-tabs {
  width: 180px;
  border-right: 1px solid var(--border-light);
  padding: 12px 0;
  flex-shrink: 0;
}

.settings-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 20px;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms;
  text-align: left;
}

.settings-tab:hover:not(.disabled):not(.active) {
  background: var(--primary-light);
  color: var(--primary);
}

.settings-tab.active {
  background: var(--primary-light);
  color: var(--primary);
  font-weight: 600;
  border-left: 3px solid var(--primary);
}

.settings-tab.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tab-badge {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--border-light);
  padding: 2px 6px;
  border-radius: 8px;
}

.settings-panel {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.placeholder-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.placeholder-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
</style>
