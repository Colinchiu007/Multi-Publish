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
    <el-dialog
      v-model="showFormDialog"
      :title="isEditing ? '编辑 Provider' : '添加 Provider'"
      width="560px"
      :close-on-click-modal="false"
      @close="resetForm"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="120px"
        label-position="left"
        size="default"
      >
        <el-form-item label="标识名" prop="name">
          <el-input v-model="form.name" placeholder="如 openai, doubao" :disabled="isEditing" />
          <div class="form-hint">唯一标识，创建后不可修改</div>
        </el-form-item>

        <el-form-item label="类型" prop="provider_type">
          <el-select v-model="form.provider_type" style="width:100%">
            <el-option label="LLM" value="llm" />
            <el-option label="视频" value="video" />
            <el-option label="图片" value="image" />
          </el-select>
        </el-form-item>

        <el-form-item label="显示名称" prop="display_name">
          <el-input v-model="form.display_name" placeholder="如 OpenAI, 豆包" />
        </el-form-item>

        <el-form-item label="Base URL" prop="base_url">
          <el-input v-model="form.base_url" placeholder="https://api.openai.com/v1" />
        </el-form-item>

        <el-form-item label="API Key" prop="api_key">
          <el-input
            v-model="form.api_key"
            type="password"
            show-password
            :placeholder="isEditing ? '留空则不修改' : 'sk-...'"
          />
          <div class="form-hint">{{ isEditing ? '编辑时留空表示不修改密钥' : '提供商 API 密钥' }}</div>
        </el-form-item>

        <el-form-item label="模型列表" prop="models">
          <el-input
            v-model="form.models"
            type="textarea"
            :rows="2"
            placeholder="每行一个模型名，如 gpt-4o&#10;gpt-4o-mini"
          />
          <div class="form-hint">每行一个模型标识符</div>
        </el-form-item>

        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <el-form-item label="最低层级" prop="min_tier">
          <el-select v-model="form.min_tier" style="width:100%">
            <el-option :label="1" :value="1" />
            <el-option :label="2" :value="2" />
            <el-option :label="3" :value="3" />
          </el-select>
          <div class="form-hint">Tier 1 最高优先，Tier 3 最低优先</div>
        </el-form-item>

        <el-form-item label="配置" prop="config">
          <el-input
            v-model="form.config"
            type="textarea"
            :rows="3"
            placeholder='{ "extra_param": "value" }'
          />
          <div class="form-hint">JSON 格式的额外配置（可选）</div>
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <button class="cohere-btn-secondary" @click="showFormDialog = false">取消</button>
          <button class="cohere-btn-primary" @click="submitForm" :disabled="submitting">
            {{ submitting ? '保存中...' : '保存' }}
          </button>
        </span>
      </template>
    </el-dialog>

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
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  providerList,
  providerCreate,
  providerUpdate,
  providerDelete,
  providerTest,
} from '@/api/providers'

// ─── 数据 ─────────────────────────────────────
const providers = ref([])
const loading = ref(true)
const submitting = ref(false)
const filterType = ref('all')

// 测试结果缓存
const testResults = ref({})
const testingName = ref('')

// 表单状态
const showFormDialog = ref(false)
const isEditing = ref(false)
const formRef = ref(null)
const form = ref({
  name: '',
  provider_type: 'llm',
  display_name: '',
  base_url: '',
  api_key: '',
  models: '',
  enabled: true,
  min_tier: 1,
  config: '',
})

// 删除状态
const showDeleteDialog = ref(false)
const deleteTarget = ref(null)

// 用户 Key 管理
const showUserKeyDialog = ref(false)
const userKeyTarget = ref(null)
const userKeyForm = ref({ apiKey: '', baseUrl: '' })

// ─── 计算属性 ─────────────────────────────────
const filteredProviders = computed(() => {
  if (filterType.value === 'all') return providers.value
  return providers.value.filter(p => p.provider_type === filterType.value)
})

const enabledCount = computed(() =>
  providers.value.filter(p => p.enabled).length
)

// ─── 表单验证 ────────────────────────────────
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

// ─── 辅助函数 ─────────────────────────────────
function typeLabel (type) {
  const map = { llm: 'LLM', video: '视频', image: '图片' }
  return map[type] || type || 'LLM'
}

function modelList (models) {
  if (!models) return '-'
  if (Array.isArray(models)) return models.join(', ')
  try { return JSON.parse(models).join(', ') } catch { return String(models) }
}

// ─── 数据加载 ─────────────────────────────────
async function loadProviders () {
  loading.value = true
  try {
    const res = await providerList()
    if (res.code === 0 && Array.isArray(res.data)) {
      providers.value = res.data
    } else {
      ElMessage.error(res.message || '加载失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

// ─── 创建/编辑 ────────────────────────────────
function openCreate () {
  isEditing.value = false
  form.value = {
    name: '', provider_type: 'llm', display_name: '',
    base_url: '', api_key: '', models: '',
    enabled: true, min_tier: 1, config: '',
  }
  showFormDialog.value = true
}

function openEdit (provider) {
  isEditing.value = true
  const models = Array.isArray(provider.models)
    ? provider.models.join('\n')
    : typeof provider.models === 'string'
      ? provider.models
      : ''
  const config = provider.config
    ? typeof provider.config === 'object'
      ? JSON.stringify(provider.config, null, 2)
      : String(provider.config)
    : ''
  form.value = {
    name: provider.name,
    provider_type: provider.provider_type || 'llm',
    display_name: provider.display_name || '',
    base_url: provider.base_url || '',
    api_key: '',
    models,
    enabled: provider.enabled !== false,
    min_tier: provider.min_tier || 1,
    config,
  }
  showFormDialog.value = true
}

function resetForm () {
  formRef.value?.resetFields()
}

async function submitForm () {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const data = {
      name: form.value.name,
      provider_type: form.value.provider_type,
      display_name: form.value.display_name,
      base_url: form.value.base_url,
      models: form.value.models.split('\n').map(s => s.trim()).filter(Boolean),
      enabled: form.value.enabled,
      min_tier: Number(form.value.min_tier) || 1,
    }
    if (form.value.api_key) data.api_key = form.value.api_key
    if (form.value.config) {
      try { data.config = JSON.parse(form.value.config) } catch { data.config = form.value.config }
    }

    let res
    if (isEditing.value) {
      res = await providerUpdate(form.value.name, data)
    } else {
      res = await providerCreate(data)
    }

    if (res.code === 0) {
      ElMessage.success(isEditing.value ? '更新成功' : '创建成功')
      showFormDialog.value = false
      await loadProviders()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    submitting.value = false
  }
}

// ─── 删除 ─────────────────────────────────────
function confirmDelete (provider) {
  deleteTarget.value = provider
  showDeleteDialog.value = true
}

async function doDelete () {
  if (!deleteTarget.value) return
  submitting.value = true
  try {
    const res = await providerDelete(deleteTarget.value.name)
    if (res.code === 0) {
      ElMessage.success('已删除')
      showDeleteDialog.value = false
      deleteTarget.value = null
      await loadProviders()
    } else {
      ElMessage.error(res.message || '删除失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    submitting.value = false
  }
}

// ─── 测试连接 ─────────────────────────────────
async function testProvider (name) {
  testingName.value = name
  delete testResults.value[name]
  try {
    const res = await providerTest(name)
    if (res.code === 0) {
      testResults.value[name] = { success: true, message: res.message || 'ok' }
    } else {
      testResults.value[name] = { success: false, message: res.message || '连接失败' }
    }
  } catch (e) {
    testResults.value[name] = { success: false, message: e.message }
  } finally {
    testingName.value = ''
    // 3 秒后自动清除结果
    setTimeout(() => { delete testResults.value[name] }, 5000)
  }
}

// ─── 用户 Key 管理 ────────────────────────────
function openUserKey (provider) {
  userKeyTarget.value = provider
  userKeyForm.value = { apiKey: '', baseUrl: '' }
  showUserKeyDialog.value = true
}

async function saveUserKey () {
  if (!userKeyTarget.value) return
  try {
    const api = window.electronAPI
    await api.providerSetUserKey(userKeyTarget.value.name, userKeyForm.value.apiKey, userKeyForm.value.baseUrl)
    ElMessage.success('用户 Key 已保存')
    showUserKeyDialog.value = false
  } catch (e) {
    ElMessage.error(e.message)
  }
}

// ─── 生命周期 ─────────────────────────────────
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
  background: var(--canvas, #fff);
  border: 1px solid var(--hairline, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.15s;
}
.provider-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}

.card-top {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--hairline, #e5e7eb);
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
.type-llm { background: #e8f0fe; color: #1a73e8; }
.type-video { background: #fce8e6; color: #d93025; }
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
  border: 1px solid var(--hairline, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--muted, #666);
  transition: all 0.12s;
}
.cohere-icon-btn:hover {
  background: var(--soft-stone, #f5f5f7);
  color: var(--ink, #222);
}
.cohere-icon-btn-danger:hover {
  background: #fce8e6;
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
  color: var(--muted, #666);
}
.provider-id code {
  font-size: 12px;
  background: var(--soft-stone, #f5f5f7);
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
  color: var(--muted, #666);
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
  background: #fce8e6;
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
  color: var(--muted, #999);
  margin-top: 4px;
  line-height: 1.3;
}

.cohere-btn-danger {
  padding: 8px 20px;
  background: #d93025;
  color: #fff;
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
  color: var(--muted, #666);
}
.cohere-empty .empty-icon {
  font-size: 48px;
  margin-bottom: var(--space-md);
}
.cohere-empty h3 {
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 8px;
  color: var(--ink, #333);
}
.cohere-empty p {
  font-size: 14px;
  margin: 0;
}
</style>
