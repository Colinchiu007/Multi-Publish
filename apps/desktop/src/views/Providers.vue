<template>
  <div>
    <!-- 页面头部 -->
    <div class="cohere-page-header">
      <div>
        <div class="page-title">Provider 配置</div>
        <div class="page-subtitle">管理 LLM / 视频 / 图片 API Provider，创建或覆盖 API Key</div>
      </div>
      <div class="page-actions">
        <button class="cohere-btn-secondary" @click="loadProviders">⟳ 刷新</button>
        <button class="cohere-btn-primary" @click="openCreate">＋ 添加 Provider</button>
      </div>
    </div>

    <!-- 过滤条 -->
    <div style="padding: var(--space-lg) var(--space-xxl) 0">
      <div class="cohere-filter-bar">
        <button class="cohere-filter-chip" :class="{ active: filterType === 'all' }" @click="filterType = 'all'">全部</button>
        <button class="cohere-filter-chip" :class="{ active: filterType === 'llm' }" @click="filterType = 'llm'">LLM</button>
        <button class="cohere-filter-chip" :class="{ active: filterType === 'video' }" @click="filterType = 'video'">视频</button>
        <button class="cohere-filter-chip" :class="{ active: filterType === 'image' }" @click="filterType = 'image'">图片</button>
        <span class="cohere-filter-meta">共 {{ filteredProviders.length }} 个 · {{ enabledCount }} 个启用</span>
      </div>
    </div>

    <!-- 加载状态 -->
    <div class="cohere-content" style="margin-top: var(--space-lg)">
      <div v-if="loading" style="text-align:center;padding:60px 0;color:var(--muted)">加载中...</div>

      <!-- 空状态 -->
      <div v-else-if="filteredProviders.length === 0" class="cohere-empty">
        <div class="empty-icon">🔌</div>
        <h3>暂无 Provider</h3>
        <p>点击右上角「添加 Provider」添加第一个 LLM/视频 Provider</p>
      </div>

      <!-- Provider 卡片网格 -->
      <div v-else class="provider-grid">
        <div v-for="p in filteredProviders" :key="p.name" class="provider-card">
          <div class="card-top">
            <div class="card-header">
              <div class="provider-type-badge" :class="'type-' + (p.provider_type || 'llm')">
                {{ typeLabel(p.provider_type) }}
              </div>
              <div class="card-actions">
                <button class="cohere-icon-btn" title="测试连接" @click="testProvider(p.name)">
                  <span v-if="testingName !== p.name">⚡</span>
                  <span v-else class="rotating">⟳</span>
                </button>
                <button class="cohere-icon-btn" title="编辑" @click="openEdit(p)">✎</button>
                <button class="cohere-icon-btn cohere-icon-btn-danger" title="删除" @click="confirmDelete(p)">✕</button>
              </div>
            </div>
            <div class="provider-name">{{ p.display_name || p.name }}</div>
            <div class="provider-id">
              <code>{{ p.name }}</code>
              <span class="status-dot" :class="p.enabled ? 'online' : 'offline'"></span>
              {{ p.enabled ? '启用' : '停用' }}
            </div>
          </div>
          <div class="card-body">
            <div class="provider-field">
              <span class="field-label">Base URL</span>
              <span class="field-value mono">{{ p.base_url || '-' }}</span>
            </div>
            <div class="provider-field">
              <span class="field-label">模型</span>
              <span class="field-value">{{ modelList(p.models) }}</span>
            </div>
            <div class="provider-field" v-if="p.min_tier">
              <span class="field-label">最低层级</span>
              <span class="field-value">Tier {{ p.min_tier }}</span>
            </div>
          </div>
          <!-- 测试结果 -->
          <div v-if="testResults[p.name]" class="card-test-result" :class="testResults[p.name].success ? 'success' : 'fail'">
            {{ testResults[p.name].success ? '✅ 连接成功' : '❌ ' + testResults[p.name].message }}
          </div>
        </div>
      </div>
    </div>

    <!-- 创建/编辑对话框 -->
    <UiModal
      :visible="showFormDialog"
      title="Provider 配置"
      size="md"
      @close="showFormDialog = false"
    >
      <div style="display:flex;flex-direction:column;gap:16px">
        <label class="input-label">标识名</label>
        <input class="input" v-model="form.name" placeholder="如 openai, doubao" :disabled="isEditing" />
        <label class="input-label">类型</label>
        <select class="input" v-model="form.provider_type" style="width:100%">
          <option value="llm">LLM</option>
          <option value="video">视频</option>
        </select>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="showFormDialog = false">取消</UiButton>
        <UiButton @click="submitForm" :disabled="submitting">{{ submitting ? '保存中...' : '保存' }}</UiButton>
      </template>
    </UiModal>

    <!-- 删除确认对话框 -->
    <el-dialog
      v-model="showDeleteDialog"
      title="确认删除"
      width="400px"
    >
      <p>确定要删除 Provider <strong>{{ deleteTarget?.name }}</strong> 吗？</p>
      <p style="font-size:13px;color:var(--muted)">此操作不可恢复，关联的 API Key 也会一并移除。</p>
      <template #footer>
        <span class="dialog-footer">
          <button class="cohere-btn-secondary" @click="showDeleteDialog = false">取消</button>
          <button class="cohere-btn-danger" @click="doDelete" :disabled="submitting">
            {{ submitting ? '删除中...' : '确认删除' }}
          </button>
        </span>
      </template>
    </el-dialog>

    <!-- 用户 Key 管理对话框 -->
    <el-dialog
      v-model="showUserKeyDialog"
      title="设置用户 API Key"
      width="480px"
    >
      <p style="font-size:14px;color:var(--muted);margin-bottom:var(--space-lg)">
        为 Provider <strong>{{ userKeyTarget?.name }}</strong> 设置你自己的 API Key，覆盖系统级配置。
      </p>
      <el-form label-width="100px" label-position="left">
        <el-form-item label="API Key">
          <el-input v-model="userKeyForm.apiKey" type="password" show-password placeholder="sk-..." />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="userKeyForm.baseUrl" placeholder="留空使用系统默认" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <button class="cohere-btn-secondary" @click="showUserKeyDialog = false">取消</button>
          <button class="cohere-btn-primary" @click="saveUserKey">保存</button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import UiModal from "../components/UiModal.vue";
import UiButton from "../components/UiButton.vue";
import { onMounted } from 'vue'
// eslint-disable-next-line no-unused-vars
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProviderCrud } from '@/composables/useProviderCrud'
import { typeLabel, modelList } from '@/composables/useProviderFilters'

const {
  // 数据状态
  providers,
  loading,
  submitting,
  filterType,
  testResults,
  testingName,
  // 表单状态
  showFormDialog,
  isEditing,
  formRef,
  form,
  // 删除状态
  showDeleteDialog,
  deleteTarget,
  // 用户 Key 状态
  showUserKeyDialog,
  userKeyTarget,
  userKeyForm,
  // 计算属性
  filteredProviders,
  enabledCount,
  // 方法
  loadProviders,
  openCreate,
  openEdit,
  submitForm,
  confirmDelete,
  doDelete,
  testProvider,
  openUserKey,
  saveUserKey,
} = useProviderCrud()

// 表单验证规则（保留原 formRules 引用，供 formRef.validate 使用）
// eslint-disable-next-line no-unused-vars
const formRules = {
  name: [
    { required: true, message: '请输入标识名', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9_-]*$/, message: '以小写字母开头，仅含字母/数字/下划线/连字符', trigger: 'blur' },
  ],
  provider_type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  display_name: [{ required: true, message: '请输入显示名称', trigger: 'blur' }],
  base_url: [{ required: true, message: '请输入 Base URL', trigger: 'blur' }],
  models: [{ required: true, message: '请至少输入一个模型', trigger: 'blur' }],
}

// 暴露给测试（w.vm.xxx）和外部组件
defineExpose({
  providers,
  loading,
  submitting,
  filterType,
  testResults,
  testingName,
  showFormDialog,
  isEditing,
  formRef,
  form,
  showDeleteDialog,
  deleteTarget,
  showUserKeyDialog,
  userKeyTarget,
  userKeyForm,
  filteredProviders,
  enabledCount,
  loadProviders,
  openCreate,
  openEdit,
  submitForm,
  confirmDelete,
  doDelete,
  testProvider,
  openUserKey,
  saveUserKey,
  typeLabel,
  modelList,
})

onMounted(() => {
  loadProviders()
})
</script>

<style scoped>
/* Provider 卡片网格 */
.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: var(--space-lg);
  padding: var(--space-lg) var(--space-xxl);
}

.provider-card {
  background: var(--canvas, var(--surface));
  border: 1px solid var(--hairline, var(--border));
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.15s;
}
.provider-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}

.card-top {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--hairline, var(--border));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.provider-type-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.type-llm { background: var(--primary-light); color: #1a73e8; }
.type-video { background: var(--secondary-light); color: #d93025; }
.type-image { background: #e6f4ea; color: #137333; }

[data-theme="dark"] .type-llm { background: #1a3a5c; color: #8ab4f8; }
[data-theme="dark"] .type-video { background: #3c1a1a; color: #f28b82; }
[data-theme="dark"] .type-image { background: #1a3c2a; color: #81c995; }

.card-actions {
  display: flex;
  gap: 4px;
}

.cohere-icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--hairline, var(--border));
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--muted, var(--text-muted));
  transition: all 0.12s;
}
.cohere-icon-btn:hover {
  background: var(--soft-stone, var(--bg));
  color: var(--ink, #222);
}
.cohere-icon-btn-danger:hover {
  background: var(--secondary-light);
  color: #d93025;
}

.provider-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink, #222);
  margin-bottom: 4px;
}

.provider-id {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted, var(--text-muted));
}
.provider-id code {
  font-size: 12px;
  background: var(--soft-stone, var(--bg));
  padding: 1px 6px;
  border-radius: 4px;
}
.provider-id .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.card-body {
  padding: var(--space-md) var(--space-lg);
}

.provider-field {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}
.provider-field:last-child { margin-bottom: 0; }

.field-label {
  color: var(--muted, var(--text-muted));
  flex-shrink: 0;
  min-width: 70px;
}
.field-value {
  color: var(--ink, #222);
  word-break: break-all;
  line-height: 1.4;
}
.field-value.mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  font-size: 12px;
}

/* 测试结果条 */
.card-test-result {
  padding: 8px var(--space-lg);
  font-size: 13px;
  font-weight: 500;
}
.card-test-result.success {
  background: #e6f4ea;
  color: #137333;
}
.card-test-result.fail {
  background: var(--secondary-light);
  color: #d93025;
}
[data-theme="dark"] .card-test-result.success {
  background: #1a3c2a;
  color: #81c995;
}
[data-theme="dark"] .card-test-result.fail {
  background: #3c1a1a;
  color: #f28b82;
}

/* 旋转动画 */
.rotating {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Element Plus 对话框适配 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-hint {
  font-size: 11px;
  color: var(--muted, var(--text-muted));
  margin-top: 4px;
  line-height: 1.3;
}

.cohere-btn-danger {
  padding: 8px 20px;
  background: #d93025;
  color: var(--surface);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.12s;
}
.cohere-btn-danger:hover {
  background: #b3261e;
}
.cohere-btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 空状态 */
.cohere-empty {
  text-align: center;
  padding: 80px 20px;
  color: var(--muted, var(--text-muted));
}
.cohere-empty .empty-icon {
  font-size: 48px;
  margin-bottom: var(--space-md);
}
.cohere-empty h3 {
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 8px;
  color: var(--ink, var(--ink));
}
.cohere-empty p {
  font-size: 14px;
  margin: 0;
}
</style>
