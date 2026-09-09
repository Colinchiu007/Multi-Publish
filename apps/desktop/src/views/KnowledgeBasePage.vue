<template>
  <div class="cohere-page">
    <div class="cohere-page-header">
      <div>
        <div class="page-title">{{ t('knowledgeBase.title') }}</div>
        <div class="page-subtitle">{{ activeTab === 'viral' ? '爆款内容库 — 搜集管理自媒体爆款内容' : '个人知识资产 — 管理IP人设、背景、经历、观点' }}</div>
      </div>
      <div class="page-actions" style="display:flex;gap:8px">
        <button v-if="activeTab === 'viral'" class="cohere-btn-primary" @click="showViralForm = true">＋ {{ t('knowledgeBase.addViral') }}</button>
        <button v-if="activeTab === 'personal'" class="cohere-btn-primary" @click="showPersonalForm = true">＋ {{ t('knowledgeBase.addPersonal') }}</button>
        <button v-if="activeTab === 'personal'" class="cohere-btn-secondary" @click="triggerBatchImport">📁 {{ t('knowledgeBase.batchImport') }}</button>
        <button class="cohere-btn-secondary" @click="handleExport">🪶 {{ t('knowledgeBase.exportToFeishu') }}</button>
      </div>
    </div>

    <div class="cohere-content">
      <div class="kb-tabs" style="display:flex;gap:4px;margin-bottom:16px;background:var(--soft-stone,#f5f5f5);border-radius:8px;padding:3px">
        <button class="kb-tab-btn" :class="{ active: activeTab === 'viral' }" @click="activeTab = 'viral'">{{ t('knowledgeBase.tabViral') }}</button>
        <button class="kb-tab-btn" :class="{ active: activeTab === 'personal' }" @click="activeTab = 'personal'">{{ t('knowledgeBase.tabPersonal') }}</button>
      </div>

      <ViralLibraryTable v-if="activeTab === 'viral'" ref="viralRef" />
      <PersonalKnowledgePanel v-if="activeTab === 'personal'" ref="personalRef" />

      <ViralFormDialog v-if="showViralForm" :item="editingViral" @close="showViralForm = false; editingViral = null" @saved="onViralSaved" />
      <PersonalFormDialog v-if="showPersonalForm" :item="editingPersonal" @close="showPersonalForm = false; editingPersonal = null" @saved="onPersonalSaved" />

      <input ref="fileInput" type="file" multiple accept=".txt,.md,.doc,.docx" style="display:none" @change="onFilesSelected" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import ViralLibraryTable from '@/components/ViralLibraryTable.vue'
import PersonalKnowledgePanel from '@/components/PersonalKnowledgePanel.vue'
import ViralFormDialog from '@/components/ViralFormDialog.vue'
import PersonalFormDialog from '@/components/PersonalFormDialog.vue'

const { t } = useI18n()
const activeTab = ref('viral')
const showViralForm = ref(false)
const showPersonalForm = ref(false)
const editingViral = ref(null)
const editingPersonal = ref(null)
const viralRef = ref(null)
const personalRef = ref(null)
const fileInput = ref(null)

function onViralSaved() {
  showViralForm.value = false
  editingViral.value = null
  viralRef.value?.loadData()
}

function onPersonalSaved() {
  showPersonalForm.value = false
  editingPersonal.value = null
  personalRef.value?.loadData()
}

function triggerBatchImport() {
  fileInput.value?.click()
}

function onFilesSelected(e) {
  const files = e.target.files
  if (!files || !files.length) return
  const names = Array.from(files).map(f => f.name).join(', ')
  ElMessage.info('已选择 ' + files.length + ' 个文件：' + names + '（批量导入功能即将上线）')
  fileInput.value.value = ''
}

function handleExport() {
  ElMessage.info('飞书导出功能即将上线。请先在设置页的"飞书 API"标签页中配置 App ID 和 App Secret。')
}
</script>

<style scoped>
.cohere-page { padding: 0; }
.cohere-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--surface, #fff);
}
.page-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.page-subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
.cohere-btn-primary {
  padding: 8px 16px;
  background: var(--coral, #f56c6c);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.cohere-btn-secondary {
  padding: 8px 16px;
  background: var(--soft-stone, #f5f5f5);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.cohere-content { padding: 12px 20px; }
.kb-tab-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--muted);
  transition: all 0.15s;
}
.kb-tab-btn.active {
  background: var(--surface, #fff);
  color: var(--text-primary);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
</style>

