<template>
  <div>
    <h2 style="margin-top: 0">账号管理</h2>

    <el-card shadow="never">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>已配置账号</span>
          <el-button type="primary" size="small" @click="refresh">
            刷新
          </el-button>
        </div>
      </template>

      <el-table :data="accounts" stripe style="width: 100%" v-loading="loading">
        <el-table-column prop="platform" label="平台" width="140">
          <template #default="{ row }">
            <span>{{ platformLabel(row.platform) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="account_name" label="账号名" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '有效' : '未配置' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default>
            <el-button type="danger" size="small" link>删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && accounts.length === 0" description="暂无已配置的账号" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { listAccounts } from '@/api/publisher'

const loading = ref(false)
const accounts = ref([])

const platformMap = {
  wechat_mp: '微信公众号',
  zhihu: '知乎',
  weibo: '微博'
}

function platformLabel (id) {
  return platformMap[id] || id
}

async function refresh () {
  loading.value = true
  try {
    const res = await listAccounts()
    if (res.code === 0) {
      accounts.value = res.data || []
    }
  } catch (e) {
    console.error('Failed to load accounts:', e)
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>