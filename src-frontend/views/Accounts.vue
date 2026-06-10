<template>
  <div>
    <h2 style="margin-top: 0">账号管理</h2>

    <el-card shadow="never">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>已配置账号</span>
          <div>
            <el-button type="primary" size="small" @click="showAddDialog = true">
              + 新增账号
            </el-button>
            <el-button size="small" @click="refresh">刷新</el-button>
          </div>
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
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button type="primary" size="small" link @click="checkLogin(row)">验证</el-button>
            <el-button type="danger" size="small" link @click="removeAccount(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && accounts.length === 0" description="暂无已配置的账号，点击「新增账号」添加" />
    </el-card>

    <!-- 新增账号对话框 -->
    <el-dialog v-model="showAddDialog" title="新增账号" width="500px">
      <el-form label-position="top">
        <el-form-item label="选择平台">
          <el-select v-model="newPlatform" placeholder="请选择平台" style="width: 100%">
            <el-option
              v-for="p in availablePlatforms"
              :key="p.id"
              :label="p.label"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="adding" @click="addAccount">
          确认添加
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listAccounts, accountAdd, accountDelete, accountCheckLogin } from '@/api/publisher'

const loading = ref(false)
const accounts = ref([])
const showAddDialog = ref(false)
const adding = ref(false)
const newPlatform = ref('')

const platformMap = {
  wechat_mp: '微信公众号',
  zhihu: '知乎',
  weibo: '微博',
  douyin: '抖音',
  xiaohongshu: '小红书',
  tencent_video: '视频号',
  kuaishou: '快手',
  toutiao: '今日头条',
  youtube: 'YouTube',
  tiktok: 'TikTok',
}

const availablePlatforms = Object.entries(platformMap).map(([id, label]) => ({ id, label }))

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

async function addAccount () {
  if (!newPlatform.value) {
    ElMessage.warning('请选择平台')
    return
  }
  adding.value = true
  try {
    const res = await accountAdd(newPlatform.value)
    if (res.code === 0) {
      ElMessage.success('账号添加成功，请在弹出的浏览器窗口中完成登录')
      showAddDialog.value = false
      newPlatform.value = ''
      refresh()
    } else {
      ElMessage.error(res.message || '添加失败')
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    adding.value = false
  }
}

async function checkLogin (row) {
  ElMessage.info(`正在验证 ${platformLabel(row.platform)} 登录状态...`)
  try {
    const res = await accountCheckLogin(row.platform, row.id)
    if (res.code === 0 && res.data?.valid) {
      ElMessage.success('登录状态有效')
    } else {
      ElMessage.warning(res.data?.message || '登录已过期，请重新添加账号')
    }
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function removeAccount (row) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${platformLabel(row.platform)}」账号「${row.account_name}」吗？`,
      '确认删除',
      { type: 'warning' }
    )
    const res = await accountDelete(row.id)
    if (res.code === 0) {
      ElMessage.success('账号已删除')
      refresh()
    } else {
      ElMessage.error(res.message || '删除失败')
    }
  } catch (e) {
    // 用户取消
  }
}

onMounted(refresh)
</script>