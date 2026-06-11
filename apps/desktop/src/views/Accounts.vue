<template>
  <div>
    <!-- 页面头部 -->
    <div class="cohere-page-header">
      <div>
        <div class="page-title">账号管理</div>
        <div class="page-subtitle">管理各平台发布账号，登录状态长期有效</div>
      </div>
      <div class="page-actions">
        <button class="cohere-btn-secondary" @click="refresh">刷新</button>
        <button class="cohere-btn-primary" @click="showAddDialog = true">+ 添加账号</button>
      </div>
    </div>

    <!-- 过滤条 -->
    <div style="padding: var(--space-lg) var(--space-xxl) 0">
      <div class="cohere-filter-bar">
        <button
          class="cohere-filter-chip"
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >全部</button>
        <button
          class="cohere-filter-chip"
          :class="{ active: filter === 'active' }"
          @click="filter = 'active'"
        >已登录</button>
        <button
          class="cohere-filter-chip"
          :class="{ active: filter === 'inactive' }"
          @click="filter = 'inactive'"
        >未登录</button>
        <span class="cohere-filter-meta">共 {{ filteredAccounts.length }} 个平台</span>
      </div>
    </div>

    <!-- 内容体 -->
    <div class="cohere-content">
      <div v-if="loading" style="text-align:center;padding:60px 0;color:var(--muted)">加载中...</div>
      <div v-else-if="filteredAccounts.length === 0" class="cohere-empty">
        <div class="empty-icon">📭</div>
        <h3>暂无账号</h3>
        <p>点击右上角「添加账号」开始配置</p>
      </div>
      <div v-else class="cohere-card-grid">
        <div
          v-for="acc in filteredAccounts"
          :key="acc.id"
          class="cohere-card"
        >
          <div class="card-top">
            <div class="card-icon">{{ platformIcon(acc.platform) }}</div>
            <div class="card-info">
              <div class="card-platform">{{ platformLabel(acc.platform) }}</div>
              <div class="card-account">{{ acc.account_name || '未命名' }}</div>
            </div>
            <span v-if="acc.status === 'active'" class="cohere-tag cohere-tag-success">有效</span>
            <span v-else class="cohere-tag cohere-tag-warning">未配置</span>
          </div>
          <div class="card-actions">
            <button @click="openPlatform(acc)">打开</button>
            <button @click="checkLogin(acc)">验证</button>
            <button class="danger" @click="removeAccount(acc)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增账号对话框 (使用 el-dialog 保持交互一致性) -->
    <el-dialog v-model="showAddDialog" title="添加账号" width="500px">
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
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listAccounts, accountAdd, accountDelete, accountCheckLogin } from '@/api/publisher'

const loading = ref(false)
const accounts = ref([])
const showAddDialog = ref(false)
const adding = ref(false)
const newPlatform = ref('')
const filter = ref('all')

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

const platformIconMap = {
  wechat_mp: '💬',
  zhihu: '❓',
  weibo: '✧',
  douyin: '🎵',
  xiaohongshu: '📕',
  tencent_video: '▶',
  kuaishou: '🎬',
  toutiao: '📰',
  youtube: '▶',
  tiktok: '♪',
}

const availablePlatforms = Object.entries(platformMap).map(([id, label]) => ({ id, label }))

function platformLabel (id) {
  return platformMap[id] || id
}

function openPlatform (row) {
  var url = {
    wechat_mp: 'https://mp.weixin.qq.com/',
    zhihu: 'https://www.zhihu.com/',
    weibo: 'https://weibo.com/',
    douyin: 'https://www.douyin.com/',
    xiaohongshu: 'https://creator.xiaohongshu.com/',
    tencent_video: 'https://channels.weixin.qq.com/',
    kuaishou: 'https://cp.kuaishou.com/',
    toutiao: 'https://mp.toutiao.com/',
    youtube: 'https://studio.youtube.com/',
    tiktok: 'https://www.tiktok.com/upload/'
  }[row.platform];
  if (url) window.open(url, '_blank');
}

function platformIcon (id) {
  return platformIconMap[id] || '📦'
}

const filteredAccounts = computed(() => {
  if (filter.value === 'all') return accounts.value
  if (filter.value === 'active') return accounts.value.filter(a => a.status === 'active')
  return accounts.value.filter(a => a.status !== 'active')
})

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