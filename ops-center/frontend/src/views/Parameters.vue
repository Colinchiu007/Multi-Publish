<template>
  <div>
    <h1 style="margin-bottom:24px">项目运行参数</h1>
    <el-tabs v-model="activeProject" @tab-change="loadParams">
      <el-tab-pane v-for="p in projects" :key="p.code" :label="p.name" :name="p.code" />
    </el-tabs>
    <el-card shadow="never" style="margin-top:16px">
      <el-table :data="params" stripe v-loading="loading">
        <el-table-column prop="key" label="参数名" min-width="200" />
        <el-table-column label="当前值" min-width="200">
          <template #default="{ row }">
            <span v-if="!editing[row.id]">{{ row.value }}</span>
            <el-input v-else v-model="editValues[row.id]" size="small" style="width:200px" />
          </template>
        </el-table-column>
        <el-table-column prop="value_type" label="类型" width="80" />
        <el-table-column prop="description" label="描述" min-width="250" show-overflow-tooltip />
        <el-table-column label="操作" width="160" align="center">
          <template #default="{ row }">
            <template v-if="!editing[row.id]">
              <el-button link type="primary" size="small" @click="startEdit(row)">编辑</el-button>
            </template>
            <template v-else>
              <el-button link type="success" size="small" @click="saveParam(row)">保存</el-button>
              <el-button link size="small" @click="cancelEdit(row)">取消</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && params.length === 0" description="此项目暂无参数" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getProjects, getProjectConfig, updateConfigItem } from '../api/config'

const projects = ref([])
const activeProject = ref('smart-sentence-splitter')
const params = ref([])
const loading = ref(false)
const editing = reactive({})
const editValues = reactive({})

onMounted(async () => {
  try { projects.value = (await getProjects()).projects || [] } catch {}
  await loadParams()
})

async function loadParams() {
  loading.value = true
  try {
    const data = await getProjectConfig(activeProject.value, 'project_param')
    params.value = data.items || []
  } catch { params.value = [] }
  finally { loading.value = false }
}

function startEdit(row) {
  editing[row.id] = true
  editValues[row.id] = row.value
}

function cancelEdit(row) {
  editing[row.id] = false
}

async function saveParam(row) {
  try {
    await updateConfigItem(row.project_code, 'project_param', row.key, {
      value: editValues[row.id], value_type: row.value_type
    })
    row.value = editValues[row.id]
    editing[row.id] = false
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败')
  }
}
</script>
