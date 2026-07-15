<template>
  <div>
    <!-- 页面头部 -->
    <div class="cohere-page-header">
      <div>
        <div class="page-title">模型服务商设置</div>
        <div class="page-subtitle">管理推理 / TTS语音 / 语音识别 / 图片生成 / 视频模型 五类 AI 服务商</div>
      </div>
      <div class="page-actions">
        <button class="cohere-btn-secondary" @click="loadProviders">⟳ 刷新</button>
        <button class="cohere-btn-primary" @click="openAdd">＋ 添加服务商</button>
      </div>
    </div>

    <!-- P0: safeStorage 不可用警告横幅 -->
    <div v-if="!safeStorageAvailable" class="safe-storage-warning" role="alert">
      ⚠️ 系统加密不可用，API Key 将无法安全存储。请检查系统密钥链设置。
    </div>

    <!-- 过滤条 -->
    <div style="padding: var(--space-lg) var(--space-xxl) 0">
      <div class="cohere-filter-bar">
        <button
          v-for="opt in CATEGORY_OPTIONS" :key="opt.value"
          class="cohere-filter-chip" :class="{ active: filterCategory === opt.value }"
          :aria-pressed="filterCategory === opt.value"
          @click="filterCategory = opt.value"
        >
          {{ opt.label }}
          <span v-if="categoryCounts[opt.value]" class="chip-count">{{ categoryCounts[opt.value] }}</span>
        </button>
        <span class="cohere-filter-meta">共 {{ filteredProviders.length }} 个 · {{ configuredCount }} 个已配置</span>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="cohere-content" style="margin-top: var(--space-lg)">
      <!-- P1: 骨架屏加载 -->
      <div v-if="loading" class="provider-grid" aria-live="polite">
        <div v-for="i in 3" :key="'skeleton-' + i" class="provider-card skeleton-card">
          <div class="card-top">
            <div class="card-header">
              <div class="skeleton-bar" style="width: 60px; height: 20px;"></div>
              <div class="skeleton-bar" style="width: 16px; height: 16px; border-radius: 50%;"></div>
            </div>
            <div class="skeleton-bar" style="width: 120px; height: 18px; margin: 8px 0;"></div>
            <div class="skeleton-bar" style="width: 80px; height: 14px;"></div>
          </div>
          <div class="card-body">
            <div class="skeleton-bar" style="width: 100%; height: 14px; margin-bottom: 8px;"></div>
            <div class="skeleton-bar" style="width: 80%; height: 14px; margin-bottom: 8px;"></div>
            <div class="skeleton-bar" style="width: 60%; height: 14px;"></div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="filteredProviders.length === 0" class="cohere-empty">
        <div class="empty-icon">🔌</div>
        <h3>暂无服务商</h3>
        <p>点击右上角「添加服务商」配置第一个 AI 模型</p>
      </div>

      <!-- 服务商卡片网格 -->
      <div v-else class="provider-grid">
        <div
          v-for="p in filteredProviders" :key="p.id"
          class="provider-card"
          :class="{ 'card-disabled': !p.enabled }"
        >
          <div class="card-top">
            <div class="card-header">
              <div class="provider-type-badge" :class="'type-' + p.category">
                {{ CATEGORY_LABELS[p.category] || p.category }}
              </div>
              <div class="card-badges">
                <span v-if="p.is_default" class="default-badge" title="默认服务商">★ 默认</span>
                <!-- P0: 色盲友好 status-dot — 用形状区分而非仅颜色 -->
                <span
                  class="status-dot-icon"
                  :class="(p.api_key_masked || p.api_key) ? 'configured' : 'not-configured'"
                  :title="(p.api_key_masked || p.api_key) ? '已配置 API Key' : '未配置 API Key'"
                  :aria-label="(p.api_key_masked || p.api_key) ? '已配置 API Key' : '未配置 API Key'"
                >{{ (p.api_key_masked || p.api_key) ? '●' : '○' }}</span>
              </div>
            </div>
            <div class="provider-name">{{ p.name }}</div>
            <div class="provider-id">
              <code>{{ p.id }}</code>
              <span class="status-label" :class="p.enabled ? 'enabled' : 'disabled'">
                {{ p.enabled ? '已启用' : '已禁用' }}
              </span>
            </div>
          </div>
          <div class="card-body">
            <div class="provider-field">
              <span class="field-label">Base URL</span>
              <span class="field-value mono">{{ p.base_url || '-' }}</span>
            </div>
            <div class="provider-field">
              <span class="field-label">模型</span>
              <!-- P1: models 截断 + tooltip -->
              <span class="field-value" :title="(p.models || []).join(', ')">
                {{ formatModels(p.models) }}
              </span>
            </div>
            <div class="provider-field">
              <span class="field-label">API Key</span>
              <!-- P0: API Key 遮罩 sk-****1234 -->
              <span class="field-value mono" :class="(p.api_key_masked || p.api_key) ? 'configured' : 'not-configured'">
                {{ p.api_key_masked || (p.api_key ? '已配置' : '未配置') }}
              </span>
            </div>
          </div>
          <!-- 测试结果 -->
          <div v-if="testResults[p.id]" class="card-test-result" :class="testResults[p.id].success ? 'success' : 'fail'">
            {{ testResults[p.id].success ? '✅ ' + testResults[p.id].message : '❌ ' + testResults[p.id].message }}
          </div>
          <!-- 操作按钮 -->
          <div class="card-actions">
            <!-- P0: aria-label 补全 -->
            <button
              class="cohere-icon-btn"
              aria-label="测试连接"
              title="测试连接"
              @click="testProvider(p.id)"
              :disabled="!(p.api_key_masked || p.api_key)"
            >
              <span v-if="testingId !== p.id">⚡</span>
              <span v-else class="rotating">⟳</span>
            </button>
            <button class="cohere-icon-btn" aria-label="编辑" title="编辑" @click="openEdit(p)">✎</button>
            <button
              class="cohere-icon-btn" :class="{ 'default-active': p.is_default }"
              :aria-label="p.is_default ? '当前默认' : '设为默认'"
              :title="p.is_default ? '当前默认' : '设为默认'"
              @click="!p.is_default && setDefault(p)"
              :disabled="p.is_default || !(p.api_key_masked || p.api_key)"
            >★</button>
            <button
              class="cohere-icon-btn"
              :aria-label="p.enabled ? '禁用' : '启用'"
              :title="p.enabled ? '禁用' : '启用'"
              @click="toggleEnabled(p)"
            >{{ p.enabled ? '⏸' : '▶' }}</button>
            <button
              v-if="!p.is_preset"
              class="cohere-icon-btn cohere-icon-btn-danger"
              aria-label="删除"
              title="删除"
              @click="confirmDelete(p)"
            >✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加服务商对话框（多步骤） -->
    <el-dialog v-model="showAddDialog" title="添加服务商" class="responsive-dialog" :close-on-click-modal="false">
      <!-- P1: 步骤进度指示器 -->
      <div class="step-progress">
        <div v-for="n in 3" :key="n" class="step-indicator" :class="{ active: addStep >= n, current: addStep === n }">
          <span class="step-number">{{ n }}</span>
          <span class="step-text">{{ ['选择类别', '选择预设', '填写配置'][n - 1] }}</span>
        </div>
      </div>

      <!-- 步骤 1: 选择类别 -->
      <div v-if="addStep === 1" class="add-step">
        <p class="step-hint">第一步：选择模型类别</p>
        <div class="category-grid">
          <button
            v-for="opt in CATEGORY_OPTIONS.filter(o => o.value !== 'all')" :key="opt.value"
            class="category-card" :class="{ active: addCategory === opt.value }"
            @click="addCategory = opt.value"
          >
            <span class="category-icon">{{ categoryIcon(opt.value) }}</span>
            <span class="category-label">{{ opt.label }}</span>
          </button>
        </div>
      </div>

      <!-- 步骤 2: 选择预设或自定义 -->
      <div v-if="addStep === 2" class="add-step">
        <p class="step-hint">第二步：选择预设服务商或自定义</p>
        <div v-if="availablePresets.length > 0" class="preset-list">
          <button
            v-for="preset in availablePresets" :key="preset.id"
            class="preset-item" :class="{ active: addPresetId === preset.id }"
            @click="selectPreset(preset.id)"
          >
            <span class="preset-name">{{ preset.name }}</span>
            <span class="preset-url">{{ preset.base_url || '本地' }}</span>
          </button>
        </div>
        <div v-else class="no-presets">该类别暂无可添加的预设服务商</div>
        <div class="divider">或</div>
        <button class="preset-item custom" :class="{ active: isCustomAdd }" @click="selectCustom">
          <span class="preset-name">✏️ 自定义服务商</span>
          <span class="preset-url">手动填写配置信息</span>
        </button>
      </div>

      <!-- 步骤 3: 填写配置 -->
      <div v-if="addStep === 3" class="add-step">
        <p class="step-hint">第三步：配置服务商信息</p>
        <div class="form-fields">
          <label class="input-label">标识名 (ID)</label>
          <input class="input" v-model="form.id" placeholder="如 openai, anthropic" :disabled="!!addPresetId" />
          <label class="input-label">显示名称</label>
          <input class="input" v-model="form.name" placeholder="如 OpenAI" />
          <label class="input-label">Base URL</label>
          <input class="input" v-model="form.base_url" placeholder="https://api.example.com/v1" />
          <label class="input-label">API Key</label>
          <input class="input" v-model="form.api_key" type="password" placeholder="sk-..." />
          <label class="input-label">模型列表 (逗号分隔)</label>
          <input class="input" v-model="form.modelsText" placeholder="model-1, model-2" />
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <button class="cohere-btn-secondary" @click="showAddDialog = false">取消</button>
          <button v-if="addStep > 1" class="cohere-btn-secondary" @click="addStep--">上一步</button>
          <button v-if="addStep < 3" class="cohere-btn-primary" @click="nextAddStep" :disabled="addStep === 1 && !addCategory">下一步</button>
          <button v-if="addStep === 3" class="cohere-btn-primary" @click="submitForm" :disabled="submitting">
            {{ submitting ? '保存中...' : '保存' }}
          </button>
        </div>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="showFormDialog" title="编辑服务商" class="responsive-dialog">
      <div class="form-fields">
        <label class="input-label">显示名称</label>
        <input class="input" v-model="form.name" />
        <label class="input-label">Base URL</label>
        <input class="input" v-model="form.base_url" />
        <label class="input-label">API Key</label>
        <input class="input" v-model="form.api_key" type="password" placeholder="留空保持不变" />
        <label class="input-label">模型列表 (逗号分隔)</label>
        <input class="input" v-model="form.modelsText" />
      </div>
      <template #footer>
        <div class="dialog-footer">
          <button class="cohere-btn-secondary" @click="showFormDialog = false">取消</button>
          <button class="cohere-btn-primary" @click="submitForm" :disabled="submitting">
            {{ submitting ? '保存中...' : '保存' }}
          </button>
        </div>
      </template>
    </el-dialog>

    <!-- 删除确认对话框 -->
    <el-dialog v-model="showDeleteDialog" title="确认删除" class="responsive-dialog-sm">
      <p>确定要删除服务商 <strong>{{ deleteTarget?.name }}</strong> 吗？</p>
      <p style="font-size:13px;color:var(--muted)">此操作不可恢复，关联的 API Key 也会一并移除。</p>
      <template #footer>
        <div class="dialog-footer">
          <button class="cohere-btn-secondary" @click="showDeleteDialog = false">取消</button>
          <button class="cohere-btn-danger" @click="doDelete" :disabled="submitting">
            {{ submitting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useModelProviderCrud } from '@/composables/useModelProviderCrud'

const {
  CATEGORY_OPTIONS,
  CATEGORY_LABELS,
  providers,
  loading,
  submitting,
  filterCategory,
  testResults,
  testingId,
  safeStorageAvailable,
  showFormDialog,
  isEditing,
  form,
  showDeleteDialog,
  deleteTarget,
  showAddDialog,
  addStep,
  addCategory,
  addPresetId,
  availablePresets,
  isCustomAdd,
  filteredProviders,
  configuredCount,
  categoryCounts,
  loadProviders,
  openAdd,
  nextAddStep,
  selectPreset,
  selectCustom,
  openEdit,
  submitForm,
  confirmDelete,
  doDelete,
  toggleEnabled,
  setDefault,
  testProvider,
} = useModelProviderCrud()

function categoryIcon (cat) {
  const icons = { llm: '🧠', tts: '🔊', speech_recognition: '🎤', image: '🖼️', video: '🎬' }
  return icons[cat] || '📦'
}

// P1: models 截断显示 — 最多 3 个，其余 +N
function formatModels (models) {
  if (!models || models.length === 0) return '-'
  if (models.length <= 3) return models.join(', ')
  return models.slice(0, 3).join(', ') + ' +' + (models.length - 3)
}

onMounted(() => {
  loadProviders()
})
</script>

<style scoped>
/* P0: safeStorage 警告横幅 */
.safe-storage-warning {
  background: #fff3e0;
  color: #e65100;
  padding: 10px var(--space-xxl);
  font-size: 13px;
  font-weight: 500;
  border-bottom: 1px solid #ffcc80;
}
[data-theme="dark"] .safe-storage-warning {
  background: #3c2a1a;
  color: #ffb74d;
  border-bottom-color: #5d4037;
}

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
  transition: box-shadow 0.15s, transform 0.15s, border-color 0.15s;
}
/* P1: card hover 微动效 */
.provider-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  transform: translateY(-2px);
  border-color: var(--primary, #1a73e8);
}
/* P1: 禁用卡片视觉降级 */
.provider-card.card-disabled {
  opacity: 0.6;
  filter: grayscale(0.5);
}

/* P1: 骨架屏 */
.skeleton-card {
  pointer-events: none;
}
.skeleton-bar {
  background: linear-gradient(90deg, var(--hairline, #e0e0e0) 25%, var(--soft-stone, #f0f0f0) 50%, var(--hairline, #e0e0e0) 75%);
  background-size: 200% 100%;
  border-radius: 4px;
  animation: skeleton-shimmer 1.5s infinite;
}
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
[data-theme="dark"] .skeleton-bar {
  background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
  background-size: 200% 100%;
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

.card-badges {
  display: flex;
  align-items: center;
  gap: 8px;
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
.type-tts { background: #fff3e0; color: #e65100; }
.type-speech_recognition { background: #e8f5e9; color: #2e7d32; }
.type-image { background: #e6f4ea; color: #137333; }
.type-video { background: var(--secondary-light); color: #d93025; }

[data-theme="dark"] .type-llm { background: #1a3a5c; color: #8ab4f8; }
[data-theme="dark"] .type-tts { background: #3c2a1a; color: #ffb74d; }
[data-theme="dark"] .type-speech_recognition { background: #1a3c1a; color: #81c995; }
[data-theme="dark"] .type-image { background: #1a3c2a; color: #81c995; }
[data-theme="dark"] .type-video { background: #3c1a1a; color: #f28b82; }

.default-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  background: #ffd700;
  color: #333;
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

/* P0: 色盲友好 status-dot — 用形状+颜色双重区分 */
.status-dot-icon {
  font-size: 14px;
  line-height: 1;
  display: inline-block;
}
.status-dot-icon.configured { color: #34a853; }
.status-dot-icon.not-configured { color: #999; }

.status-label {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
}
.status-label.enabled { color: #34a853; }
.status-label.disabled { color: #999; }

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
  overflow: hidden;
  text-overflow: ellipsis;
}
.field-value.mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  font-size: 12px;
}
.field-value.configured { color: #34a853; font-weight: 500; }
.field-value.not-configured { color: #999; }

/* 测试结果条 */
.card-test-result {
  padding: 8px var(--space-lg);
  font-size: 13px;
  font-weight: 500;
}
.card-test-result.success { background: #e6f4ea; color: #137333; }
.card-test-result.fail { background: var(--secondary-light); color: #d93025; }
[data-theme="dark"] .card-test-result.success { background: #1a3c2a; color: #81c995; }
[data-theme="dark"] .card-test-result.fail { background: #3c1a1a; color: #f28b82; }

/* 操作按钮 */
.card-actions {
  display: flex;
  gap: 4px;
  padding: var(--space-sm) var(--space-lg);
  border-top: 1px solid var(--hairline, var(--border));
  flex-wrap: wrap;
}

.cohere-icon-btn {
  width: 32px;
  height: 32px;
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
.cohere-icon-btn:hover:not(:disabled) {
  background: var(--soft-stone, var(--bg));
  color: var(--ink, #222);
}
/* P1: 按钮 :active 反馈 */
.cohere-icon-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.cohere-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.cohere-icon-btn.default-active {
  background: #ffd700;
  color: #333;
  border-color: #ffd700;
}
.cohere-icon-btn-danger:hover:not(:disabled) {
  background: var(--secondary-light);
  color: #d93025;
}

/* 过滤条数量标记 */
.chip-count {
  font-size: 10px;
  background: rgba(0,0,0,0.1);
  padding: 1px 5px;
  border-radius: 8px;
  margin-left: 4px;
}
[data-theme="dark"] .chip-count {
  background: rgba(255,255,255,0.15);
}

/* P1: 步骤进度指示器 */
.step-progress {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 0 8px;
}
.step-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.4;
  transition: opacity 0.2s;
}
.step-indicator.active { opacity: 0.7; }
.step-indicator.current { opacity: 1; }
.step-number {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: var(--hairline, #e0e0e0);
  color: var(--muted, #999);
}
.step-indicator.active .step-number {
  background: var(--primary, #1a73e8);
  color: #fff;
}
.step-text {
  font-size: 12px;
  color: var(--muted, #999);
}
.step-indicator.current .step-text {
  color: var(--ink, #222);
  font-weight: 500;
}

/* 添加对话框步骤 */
.add-step {
  padding: 8px 0;
}
.step-hint {
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 16px;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.category-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.category-card:hover { border-color: var(--primary); }
.category-card.active {
  border-color: var(--primary);
  background: var(--primary-light);
}
.category-icon { font-size: 24px; }
.category-label { font-size: 13px; font-weight: 500; }

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}
.preset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s;
}
.preset-item:hover { border-color: var(--primary); background: var(--primary-light); }
.preset-item.active { border-color: var(--primary); background: var(--primary-light); }
.preset-name { font-weight: 500; }
.preset-url { font-size: 12px; color: var(--muted); }
.no-presets {
  text-align: center;
  padding: 24px;
  color: var(--muted);
}

.divider {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  margin: 12px 0;
  position: relative;
}
.divider::before, .divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 40%;
  height: 1px;
  background: var(--border);
}
.divider::before { left: 0; }
.divider::after { right: 0; }

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.input-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
}
.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  background: var(--canvas);
  color: var(--ink);
}
.input:focus {
  outline: none;
  border-color: var(--primary);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
}
.cohere-btn-danger:hover { background: #b3261e; }
.cohere-btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

.cohere-empty {
  text-align: center;
  padding: 80px 20px;
  color: var(--muted, var(--text-muted));
}
.cohere-empty .empty-icon { font-size: 48px; margin-bottom: var(--space-md); }
.cohere-empty h3 { font-size: 18px; font-weight: 500; margin: 0 0 8px; color: var(--ink); }
.cohere-empty p { font-size: 14px; margin: 0; }

.rotating {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* P1: 响应式断点 */
@media (max-width: 768px) {
  .provider-grid {
    grid-template-columns: 1fr;
    padding: var(--space-md);
  }
  .cohere-page-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  .cohere-filter-bar {
    flex-wrap: wrap;
    gap: 6px;
  }
  .category-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .step-text {
    display: none;
  }
  .step-progress {
    justify-content: center;
    gap: 24px;
  }
}

/* P1: 响应式对话框 */
:deep(.responsive-dialog) {
  width: 90vw !important;
  max-width: 560px;
}
:deep(.responsive-dialog-sm) {
  width: 90vw !important;
  max-width: 400px;
}
@media (max-width: 768px) {
  :deep(.responsive-dialog),
  :deep(.responsive-dialog-sm) {
    width: 95vw !important;
    margin: 0 auto;
  }
}
</style>
