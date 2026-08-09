<template>
  <div>
    <h1 style="margin-bottom:16px">预设模型设置</h1>
    <p style="color:#888;margin-bottom:16px;font-size:13px">
      运营人员维护前端【模型设置】的预设服务商目录：控制是否在前端显示、维护技术文档链接（每个模型最多 10 条）；
      多模态模型可手工配置支持的能力、每能力默认模型与每能力技术文档链接（每个能力最多 10 条）。
    </p>

    <el-card shadow="never">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <el-radio-group v-model="filterCategory" @change="load">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button v-for="c in CATEGORY_OPTIONS" :key="c.value" :value="c.value">{{ c.label }}</el-radio-button>
        </el-radio-group>
        <div>
          <el-switch v-model="includeHidden" active-text="含已隐藏" @change="load" style="margin-right:16px" />
          <el-button type="primary" @click="openCreate">新增预设</el-button>
        </div>
      </div>

      <el-table :data="presets" stripe v-loading="loading" style="width:100%">
        <el-table-column prop="id" label="ID" min-width="180" />
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column label="类别" width="110">
          <template #default="{ row }">
            <el-tag size="small">{{ CATEGORY_LABELS[row.category] || row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="多模态" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_multimodal" type="warning" size="small">多模态</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="能力" min-width="200">
          <template #default="{ row }">
            <template v-if="row.capabilities && row.capabilities.length">
              <el-tag v-for="cap in row.capabilities" :key="cap" size="small" style="margin-right:4px">{{ CAP_LABELS[cap] || cap }}</el-tag>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="默认模型" min-width="150">
          <template #default="{ row }">
            <span>{{ row.default_model || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="文档链接" width="110" align="center">
          <template #default="{ row }">
            <span>{{ (row.doc_links || []).length }}/10</span>
          </template>
        </el-table-column>
        <el-table-column label="前端显示" width="100" align="center">
          <template #default="{ row }">
            <el-switch :model-value="row.is_visible" @change="(v) => toggleVisible(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showDialog" :title="editing ? `编辑预设：${form.id}` : '新增预设'" width="720px">
      <el-form label-width="120px" label-position="left">
        <el-form-item label="预设 ID" required>
          <el-input v-model="form.id" :disabled="editing" placeholder="如 minimax-multimodal" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如 MiniMax" />
        </el-form-item>
        <el-form-item label="类别" required>
          <el-select v-model="form.category" style="width:100%">
            <el-option v-for="c in CATEGORY_OPTIONS" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="form.base_url" placeholder="https://api.example.com/v1" />
        </el-form-item>
        <el-form-item label="模型列表">
          <el-input v-model="modelsText" placeholder="model-1, model-2" />
        </el-form-item>
        <el-form-item label="默认模型 ID">
          <el-input v-model="form.default_model" placeholder="平台预设默认 Model ID，如 MiniMax-M2.7" />
        </el-form-item>
        <el-form-item label="多模态模型">
          <el-switch v-model="form.is_multimodal" />
        </el-form-item>
        <el-form-item label="前端显示">
          <el-switch v-model="form.is_visible" />
          <span style="margin-left:8px;color:#888;font-size:12px">关闭后不在前端【模型设置】中显示该预设</span>
        </el-form-item>

        <template v-if="form.is_multimodal">
          <el-divider content-position="left">多模态能力配置</el-divider>
          <el-form-item label="支持能力">
            <el-select v-model="form.capabilities" multiple style="width:100%" placeholder="选择该模型支持的能力">
              <el-option v-for="c in CAP_OPTIONS" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
          </el-form-item>
          <el-form-item v-for="cap in form.capabilities" :key="cap" :label="`${CAP_LABELS[cap] || cap} 默认模型`">
            <el-input v-model="form.capability_models[cap]" :placeholder="`${cap} 对应的默认模型 ID`" />
          </el-form-item>
          <el-form-item v-for="cap in form.capabilities" :key="cap + '-docs'" :label="`${CAP_LABELS[cap] || cap} 文档链接`">
            <div style="width:100%">
              <div v-for="(link, idx) in (form.capability_doc_links[cap] || [])" :key="idx" style="display:flex;gap:8px;margin-bottom:6px">
                <el-input v-model="form.capability_doc_links[cap][idx]" placeholder="https://...（最多 10 条）" />
                <el-button @click="removeCapDoc(cap, idx)">移除</el-button>
              </div>
              <el-button size="small" :disabled="(form.capability_doc_links[cap] || []).length >= 10" @click="addCapDoc(cap)">
                + 添加文档链接
              </el-button>
            </div>
          </el-form-item>
        </template>

        <el-divider content-position="left">模型技术文档链接（最多 10 条）</el-divider>
        <el-form-item label="文档链接">
          <div style="width:100%">
            <div v-for="(link, idx) in form.doc_links" :key="idx" style="display:flex;gap:8px;margin-bottom:6px">
              <el-input v-model="form.doc_links[idx]" placeholder="https://..." />
              <el-button @click="form.doc_links.splice(idx, 1)">移除</el-button>
            </div>
            <el-button size="small" :disabled="form.doc_links.length >= 10" @click="form.doc_links.push('')">
              + 添加文档链接
            </el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listModelPresets, createModelPreset, updateModelPreset, deleteModelPreset } from '../api/modelPresets'

const CATEGORY_OPTIONS = [
  { value: 'llm', label: '推理模型' },
  { value: 'tts', label: 'TTS语音' },
  { value: 'speech_recognition', label: '语音识别' },
  { value: 'image', label: '图片生成' },
  { value: 'video', label: '视频模型' },
  { value: 'audio', label: '音频生成' },
  { value: 'multimodal', label: '多模态模型' },
]
const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map(c => [c.value, c.label]))
const CAP_OPTIONS = [
  { value: 'llm', label: '文字推理' },
  { value: 'tts', label: 'TTS语音' },
  { value: 'speech_recognition', label: '语音识别' },
  { value: 'image', label: '生图' },
  { value: 'video', label: '生成视频' },
  { value: 'audio', label: '音频生成' },
]
const CAP_LABELS = Object.fromEntries(CAP_OPTIONS.map(c => [c.value, c.label]))

const presets = ref([])
const loading = ref(false)
const saving = ref(false)
const filterCategory = ref('')
const includeHidden = ref(false)
const showDialog = ref(false)
const editing = ref(false)
const modelsText = ref('')

const form = reactive({
  id: '', name: '', category: 'llm', base_url: '', models: [], default_model: '', is_multimodal: false,
  capabilities: [], capability_models: {}, doc_links: [], capability_doc_links: {}, is_visible: true,
})

onMounted(load)

async function load() {
  loading.value = true
  try {
    const params = { include_hidden: includeHidden.value }
    if (filterCategory.value) params.category = filterCategory.value
    const data = await listModelPresets(params)
    presets.value = data.presets || []
  } catch (e) {
    if (e.response?.status === 403) {
      ElMessage.warning('需要管理员权限才能查看隐藏项')
      includeHidden.value = false
      await load()
      return
    } else {
      ElMessage.error('加载预设列表失败')
    }
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, {
    id: '', name: '', category: 'llm', base_url: '', models: [], default_model: '', is_multimodal: false,
    capabilities: [], capability_models: {}, doc_links: [], capability_doc_links: {}, is_visible: true,
  })
  modelsText.value = ''
}

function openCreate() {
  resetForm()
  editing.value = false
  showDialog.value = true
}

function openEdit(row) {
  editing.value = true
  Object.assign(form, JSON.parse(JSON.stringify(row)))
  if (!Array.isArray(form.capabilities)) form.capabilities = []
  if (!form.capability_models || typeof form.capability_models !== 'object') form.capability_models = {}
  if (!Array.isArray(form.doc_links)) form.doc_links = []
  if (!form.capability_doc_links || typeof form.capability_doc_links !== 'object') form.capability_doc_links = {}
  for (const cap of form.capabilities) {
    if (!Array.isArray(form.capability_doc_links[cap])) form.capability_doc_links[cap] = []
  }
  modelsText.value = (form.models || []).join(', ')
  showDialog.value = true
}

function addCapDoc(cap) {
  if (!Array.isArray(form.capability_doc_links[cap])) form.capability_doc_links[cap] = []
  if (form.capability_doc_links[cap].length < 10) form.capability_doc_links[cap].push('')
}

function removeCapDoc(cap, idx) {
  form.capability_doc_links[cap].splice(idx, 1)
}

async function save() {
  if (!form.id.trim() || !form.name.trim()) {
    ElMessage.warning('请填写预设 ID 与名称')
    return
  }
  const payload = JSON.parse(JSON.stringify(form))
  payload.models = modelsText.value.split(',').map(s => s.trim()).filter(Boolean)
  saving.value = true
  try {
    if (editing.value) {
      await updateModelPreset(payload.id, payload)
      ElMessage.success('已保存')
    } else {
      await createModelPreset(payload)
      ElMessage.success('已创建')
    }
    showDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleVisible(row, value) {
  try {
    await updateModelPreset(row.id, { ...JSON.parse(JSON.stringify(row)), is_visible: value })
    row.is_visible = value
    ElMessage.success(value ? '已显示' : '已隐藏')
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '操作失败')
    await load()
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除预设 ${row.name}（${row.id}）吗？`, '确认删除', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteModelPreset(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '删除失败')
  }
}
</script>
