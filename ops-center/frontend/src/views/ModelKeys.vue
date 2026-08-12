<template>
  <div class="model-keys">
    <h2>🔑 模型密钥（提示词评测）</h2>
    <p class="muted">admin 维护评测生成/翻译/评估所用的 provider 密钥；密钥加密存储，不返回前端。</p>

    <el-form inline style="margin: 12px 0">
      <el-form-item label="Provider">
        <el-select v-model="form.provider" style="width: 160px">
          <el-option v-for="p in ['minimax-image','flux','minimax-llm','minimax-vision','opencode-go-vision','hunyuan']" :key="p" :label="p" :value="p" />
        </el-select>
      </el-form-item>
      <el-form-item label="模型">
        <el-input v-model="form.model" placeholder="如 image-01" style="width: 140px" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="form.api_key" type="password" show-password style="width: 220px" />
      </el-form-item>
      <el-form-item label="Base URL">
        <el-input v-model="form.base_url" placeholder="https://api.minimaxi.com/v1" style="width: 240px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </el-form-item>
    </el-form>
    <el-alert v-if="msg" :title="msg" :type="msgType" show-icon closable @close="msg=''" />

    <el-table :data="items" stripe>
      <el-table-column prop="provider" label="Provider" width="140" />
      <el-table-column prop="model" label="模型" width="160" />
      <el-table-column prop="base_url" label="Base URL" min-width="220" />
      <el-table-column prop="enabled" label="启用" width="80">
        <template #default="{ row }">{{ row.enabled ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="200" />
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { listPromptEvalProviders, upsertPromptEvalProvider } from '../api/promptEval'

const form = ref({ provider: 'minimax-image', model: 'image-01', api_key: '', base_url: '' })
const items = ref([])
const saving = ref(false)
const msg = ref('')
const msgType = ref('success')

async function load() {
  const data = await listPromptEvalProviders()
  items.value = data.items || []
}

async function save() {
  saving.value = true
  msg.value = ''
  try {
    await upsertPromptEvalProvider({
      provider: form.value.provider, model: form.value.model,
      api_key: form.value.api_key, base_url: form.value.base_url, enabled: true,
    })
    msgType.value = 'success'
    msg.value = '密钥已保存'
    form.value.api_key = ''
    await load()
  } catch (e) {
    msgType.value = 'error'
    msg.value = '保存失败：' + (e?.response?.data?.detail || e.message)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.muted { color: #909399; font-size: 13px; }
</style>
