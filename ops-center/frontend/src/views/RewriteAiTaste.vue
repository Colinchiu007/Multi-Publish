<template>
  <div>
    <h1 style="margin-bottom:16px">去 AI 味词库</h1>
    <p style="color:var(--color-text-placeholder);margin-bottom:16px;font-size: var(--font-size-sm)">
      管理 AI 惯用语 → 人类表达的替换词表。语义为「叠加 + 键覆盖」：桌面端引擎内置词表是安全底线，
      本词库同键覆盖替换方向；停用（enabled=0）的词目桌面端将跳过该词的替换（可用于禁用内置替换）。
      词库随运行时 bootstrap 下发到桌面端，改写结果即时生效，无需重启。
    </p>

    <el-card shadow="never">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <el-input v-model="keyword" placeholder="搜索词目/替换词" clearable style="width:220px" />
          <el-select v-model="severityFilter" style="width:130px">
            <el-option label="全部级别" value="" />
            <el-option label="S1 标志词" value="S1" />
            <el-option label="S2 常见词" value="S2" />
            <el-option label="S3 英文风格" value="S3" />
          </el-select>
          <el-select v-model="statusFilter" style="width:110px">
            <el-option label="全部状态" value="" />
            <el-option label="启用" value="on" />
            <el-option label="停用" value="off" />
          </el-select>
        </div>
        <div style="display:flex;gap:8px">
          <el-button @click="exportJson">导出 JSON</el-button>
          <el-button @click="triggerImport">导入 JSON</el-button>
          <el-button type="primary" @click="openCreate">新增词目</el-button>
        </div>
        <input ref="importInput" type="file" accept=".json,application/json" style="display:none" @change="onImportFile" />
      </div>

      <el-table :data="filtered" stripe v-loading="loading" style="width:100%" max-height="620">
        <el-table-column prop="word" label="原词（AI 惯用语）" min-width="200" show-overflow-tooltip />
        <el-table-column prop="replacement" label="替换词（人类表达）" min-width="180" show-overflow-tooltip />
        <el-table-column label="级别" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.severity === 'S1' ? 'danger' : row.severity === 'S2' ? 'warning' : 'info'" size="small">
              {{ row.severity }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" :before-change="() => confirmToggle(row)" @change="() => toggle(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="updatedBy" label="更新人" width="110" show-overflow-tooltip />
        <el-table-column prop="updatedAt" label="更新时间" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="140" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="无匹配词目" />
        </template>
      </el-table>
      <div style="color:var(--color-text-placeholder);margin-top:8px;font-size: var(--font-size-xs)">
        共 {{ items.length }} 条，当前显示 {{ filtered.length }} 条。编辑不可修改原词（word 为主键）；改词请删除后新增。
      </div>
    </el-card>

    <el-dialog v-model="showDialog" :title="editing ? `编辑词目：${form.word}` : '新增词目'" width="560px" top="8vh">
      <el-form label-width="110px" label-position="left">
        <el-form-item label="原词" required>
          <el-input v-model="form.word" :disabled="editing" maxlength="30" show-word-limit placeholder="AI 惯用语（≤30 字，不可为纯标点/单字符正则元字符）" />
          <span v-if="editing" style="color:var(--color-text-placeholder);font-size: var(--font-size-xs)">原词为主键，编辑态不可修改</span>
        </el-form-item>
        <el-form-item label="替换词" required>
          <el-input v-model="form.replacement" maxlength="50" show-word-limit placeholder="人类表达（≤50 字）" />
        </el-form-item>
        <el-form-item label="级别" required>
          <el-select v-model="form.severity" style="width:100%">
            <el-option label="S1 — AI 标志性结构词（单次命中即改）" value="S1" />
            <el-option label="S2 — 常见 AI 词汇（密度驱动）" value="S2" />
            <el-option label="S3 — 英文风格偏好（可选修复）" value="S3" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="200" placeholder="条目说明（可选，≤200 字）" />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listAiTasteEntries, createAiTasteEntry, updateAiTasteEntry,
  deleteAiTasteEntry, toggleAiTasteEntry, importAiTasteEntries,
} from '../api/rewriteAiTaste'

const items = ref([])
const loading = ref(false)
const saving = ref(false)
const showDialog = ref(false)
const editing = ref(false)
const keyword = ref('')
const severityFilter = ref('')
const statusFilter = ref('')
const importInput = ref(null)

const form = reactive({ word: '', replacement: '', severity: 'S2', description: '' })

onMounted(load)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return items.value.filter((x) => {
    if (kw && !x.word.toLowerCase().includes(kw) && !x.replacement.toLowerCase().includes(kw)) return false
    if (severityFilter.value && x.severity !== severityFilter.value) return false
    if (statusFilter.value === 'on' && !x.enabled) return false
    if (statusFilter.value === 'off' && x.enabled) return false
    return true
  })
})

async function load() {
  loading.value = true
  try {
    const data = await listAiTasteEntries()
    items.value = data.items || []
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '加载词库失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = false
  Object.assign(form, { word: '', replacement: '', severity: 'S2', description: '' })
  showDialog.value = true
}

function openEdit(row) {
  editing.value = true
  Object.assign(form, { word: row.word, replacement: row.replacement, severity: row.severity, description: row.description || '' })
  showDialog.value = true
}

async function save() {
  if (!form.word.trim()) {
    ElMessage.warning('原词不能为空')
    return
  }
  if (!form.replacement.trim()) {
    ElMessage.warning('替换词不能为空')
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await updateAiTasteEntry(form.word, { replacement: form.replacement, severity: form.severity, description: form.description })
      ElMessage.success('词目已更新')
    } else {
      await createAiTasteEntry({ word: form.word, replacement: form.replacement, severity: form.severity, description: form.description })
      ElMessage.success('词目已创建')
    }
    showDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggle(row) {
  const prev = row.enabled
  try {
    const item = await toggleAiTasteEntry(row.word)
    row.enabled = item.enabled
    ElMessage.success(item.enabled ? '已启用（恢复该词替换）' : '已停用（桌面端跳过该词替换）')
  } catch (e) {
    // 评审 W2：失败回滚开关视觉态（el-switch 已先行翻转，失败必须恢复请求前值）
    row.enabled = prev
    ElMessage.error(e.response?.data?.detail || '操作失败')
  }
}

// 评审 W2 配套：before-change 阻断式语义说明（点击开关先弹确认，避免误触停用影响桌面端改写）
function confirmToggle(row) {
  const turningOff = row.enabled
  if (!turningOff) return Promise.resolve(true)
  return ElMessageBox.confirm(
    `停用「${row.word}」后，桌面端改写将跳过该词的替换（内置词恢复内置行为）。确认？`,
    '停用确认',
    { confirmButtonText: '停用', cancelButtonText: '取消', type: 'warning' }
  ).then(() => true).catch(() => false)
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除词目「${row.word}」？删除后该词回到引擎内置替换（若为内置词）或不再替换（若为新增词）。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await deleteAiTasteEntry(row.word)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '删除失败')
  }
}

function exportJson() {
  // 含 description（评审 I5）：导出即全量备份，可再导入还原（import 支持 description 透传）
  const blob = new Blob([JSON.stringify(items.value.map((x) => ({ word: x.word, replacement: x.replacement, severity: x.severity, enabled: x.enabled, description: x.description || '' })), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ai-taste-map-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  importInput.value && importInput.value.click()
}

async function onImportFile(ev) {
  const file = ev.target.files && ev.target.files[0]
  ev.target.value = ''
  if (!file) return
  let entries
  try {
    const parsed = JSON.parse(await file.text())
    entries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.entries) ? parsed.entries : null)
  } catch {
    ElMessage.error('JSON 解析失败：请导出格式为「条目数组」或「{ entries: [...] }」的文件')
    return
  }
  if (!entries) {
    ElMessage.error('文件格式不正确：需要条目数组')
    return
  }
  if (entries.length === 0) {
    // 评审 I4：空数组前置拦截，免一次无效确认往返
    ElMessage.warning('导入文件不包含任何词目')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将导入 ${entries.length} 条词目（按 word 幂等覆盖既有条目）。导入是整批原子的：任一条目非法整批拒绝。继续？`,
      '导入确认',
      { confirmButtonText: '导入', cancelButtonText: '取消', type: 'info' }
    )
  } catch {
    return
  }
  try {
    const r = await importAiTasteEntries(entries)
    ElMessage.success(`已导入 ${r.imported} 条`)
    await load()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '导入失败')
  }
}
</script>
