<template>
  <div class="page">
    <h1 style="margin-bottom: 16px">运营公告</h1>
    <div style="margin-bottom: 12px">
      <el-button type="primary" @click="openCreate">＋ 新建公告</el-button>
    </div>
    <el-table :data="items" border stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="title" label="标题" min-width="160" />
      <el-table-column prop="severity" label="级别" width="110">
        <template #default="{ row }">
          <el-tag :type="severityTag(row.severity)">{{ severityLabel(row.severity) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="active_from" label="开始" width="170" />
      <el-table-column prop="active_until" label="结束" width="170" />
      <el-table-column prop="sort_order" label="排序" width="70" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" @change="v => toggleEnabled(row, v)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" align="center">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑公告' : '新建公告'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="如：系统维护通知" maxlength="120" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.content" type="textarea" :rows="3" placeholder="公告详情（可空）" />
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="form.severity">
            <el-option label="提示（info）" value="info" />
            <el-option label="重要提醒（warning）" value="warning" />
            <el-option label="系统维护（maintenance，桌面端不可关闭）" value="maintenance" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始时间">
          <el-input v-model="form.active_from" placeholder="ISO 时间，空=不限（如 2026-08-10T00:00:00）" />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-input v-model="form.active_until" placeholder="ISO 时间，空=不限" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../api/runtimePolicy'

const items = ref([])
const dialogVisible = ref(false)
const editing = ref(false)
const saving = ref(false)
const form = ref({ title: '', content: '', severity: 'info', active_from: '', active_until: '', sort_order: 0, enabled: true })

function severityLabel(s) {
  return { info: '提示', warning: '重要提醒', maintenance: '系统维护' }[s] || s
}
function severityTag(s) {
  return { info: 'info', warning: 'warning', maintenance: 'danger' }[s] || 'info'
}

async function load() {
  const data = await listAnnouncements()
  items.value = data.items || []
}

function openCreate() {
  editing.value = false
  form.value = { title: '', content: '', severity: 'info', active_from: '', active_until: '', sort_order: 0, enabled: true }
  dialogVisible.value = true
}
function openEdit(row) {
  editing.value = true
  form.value = { ...row, enabled: !!row.enabled }
  dialogVisible.value = true
}

async function save() {
  saving.value = true
  try {
    const payload = { ...form.value, enabled: !!form.value.enabled }
    if (editing.value) await updateAnnouncement(form.value.id, payload)
    else await createAnnouncement(payload)
    ElMessage.success('已保存')
    dialogVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row, v) {
  try {
    await updateAnnouncement(row.id, { ...row, enabled: v })
    ElMessage.success(v ? '已启用' : '已停用')
    await load()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || e.message || '操作失败')
  }
}

async function remove(row) {
  await ElMessageBox.confirm(`确定删除公告「${row.title}」吗？`, '确认删除', { type: 'warning' })
  try {
    await deleteAnnouncement(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || e.message || '删除失败')
  }
}

onMounted(load)
</script>
