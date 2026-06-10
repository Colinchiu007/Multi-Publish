<template>
  <div class="publish-page">
    <h2 style="margin-top: 0">一键发布</h2>

    <el-row :gutter="24">
      <!-- 左侧：文章编辑 -->
      <el-col :span="16">
        <el-card shadow="never">
          <template #header>
            <span>文章内容</span>
          </template>

          <el-form label-position="top">
            <el-form-item label="标题">
              <el-input
                v-model="article.title"
                placeholder="请输入文章标题"
                maxlength="64"
                show-word-limit
              />
            </el-form-item>

            <el-form-item label="作者">
              <el-input
                v-model="article.author"
                placeholder="作者名称（选填）"
                maxlength="20"
                style="max-width: 300px"
              />
            </el-form-item>

            <el-form-item label="正文 (HTML)">
              <ArticleEditor v-model="article.content" />
            </el-form-item>

            <!-- 视频上传（抖音/视频号/快手用） -->
            <el-form-item label="视频文件" v-if="selectedPlatforms.some(p => ['douyin', 'tencent_video', 'kuaishou'].includes(p))">
              <el-upload
                drag
                :auto-upload="false"
                :limit="1"
                accept="video/*"
                :on-change="(file) => article.video_path = file.raw?.path || file.raw?.name || ''"
              >
                <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                <div class="el-upload__text">拖拽视频文件到这里，或 <em>点击选择</em></div>
                <template #tip>
                  <div class="el-upload__tip">支持 mp4/mov/avi，最大 500MB</div>
                </template>
              </el-upload>
            </el-form-item>

            <el-form-item label="封面图 URL">
              <el-input
                v-model="article.cover_url"
                placeholder="封面图片链接（选填）"
              />
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：平台选择 + 操作 -->
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>
            <span>发布目标</span>
          </template>

          <el-checkbox-group v-model="selectedPlatforms">
            <el-checkbox
              v-for="p in platforms"
              :key="p.id"
              :label="p.id"
              :disabled="p.disabled"
              style="display: flex; margin-bottom: 12px"
            >
              <span style="margin-left: 6px">{{ p.label }}</span>
              <el-tag v-if="p.tag" :type="p.tagType" size="small" style="margin-left: 8px">
                {{ p.tag }}
              </el-tag>
            </el-checkbox>
          </el-checkbox-group>

          <el-divider />

          <el-button
            type="primary"
            size="large"
            :loading="publishing"
            :disabled="selectedPlatforms.length === 0"
            style="width: 100%"
            @click="handlePublish"
          >
            {{ publishing ? '发布中...' : '🚀 一键发布' }}
          </el-button>

          <!-- 进度显示 -->
          <div v-if="progress.length > 0" style="margin-top: 16px">
            <el-timeline>
              <el-timeline-item
                v-for="(item, idx) in progress"
                :key="idx"
                :type="item.type"
                :timestamp="item.time"
              >
                {{ item.text }}
              </el-timeline-item>
            </el-timeline>
          </div>
        </el-card>

        <!-- 发布结果 -->
        <el-card v-if="result" shadow="never" style="margin-top: 16px">
          <template #header>
            <span>发布结果</span>
          </template>
          <el-alert
            :title="result.success ? '发布成功' : '发布失败'"
            :type="result.success ? 'success' : 'error'"
            :description="result.message"
            show-icon
            :closable="false"
          />
          <div v-if="result.url" style="margin-top: 12px">
            <el-link :href="result.url" target="_blank" type="primary">
              查看文章 →
            </el-link>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { publishWechat, publishBatch, onProgress } from '@/api/publisher'
import ArticleEditor from '@/components/ArticleEditor.vue'

// 平台列表
const platforms = [
  { id: 'wechat_mp', label: '微信公众号', icon: '📢', tagType: 'success' },
  { id: 'zhihu', label: '知乎', icon: '📝', tagType: 'success' },
  { id: 'weibo', label: '微博', icon: '📱', tag: '新增', tagType: 'success' },
  { id: 'douyin', label: '抖音', icon: '🎵', tag: '新增', tagType: 'success' },
  { id: 'xiaohongshu', label: '小红书', icon: '📕', tag: '新增', tagType: 'warning' },
  { id: 'tencent_video', label: '视频号', icon: '🎬', tag: '新', tagType: 'success' },
  { id: 'kuaishou', label: '快手', icon: '⚡', tag: '新', tagType: 'success' },
    { id: 'toutiao', label: '今日头条', icon: '📰', tag: '新', tagType: 'success' },
    { id: 'youtube', label: 'YouTube', icon: '▶️', tag: '新', tagType: 'success' },
    { id: 'tiktok', label: 'TikTok', icon: '🎶', tag: '新', tagType: 'success' }
  ]

const selectedPlatforms = ref(['wechat_mp'])
const publishing = ref(false)
const progress = ref([])
const result = ref(null)
const cancelListen = ref(null)

const article = reactive({
  title: '',
  content: '',
  author: '',
  cover_url: '',
  video_path: ''
})

function addProgress (text, type = 'primary') {
  const now = new Date()
  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  progress.value.push({ text, time, type })
}

async function handlePublish () {
  if (!article.title.trim()) {
    ElMessage.warning('请输入文章标题')
    return
  }
  if (!article.content.trim()) {
    ElMessage.warning('请输入正文内容')
    return
  }

  publishing.value = true
  progress.value = []
  result.value = null

  // 注册进度监听
  if (cancelListen.value) cancelListen.value()
  cancelListen.value = onProgress((data) => {
    addProgress(`[${data.platform}] ${data.stage}`)
  })

  try {
    // 使用批量发布 (任务队列)
    const articleData = {
          title: article.title,
          content: article.content,
          author: article.author || '',
          cover_url: article.cover_url || '',
          video_path: article.video_path || ''
        }

    if (selectedPlatforms.value.length === 1 && selectedPlatforms.value[0] === 'wechat_mp') {
      // 单平台走原有 publish:wechat
      addProgress('开始发布到 微信公众号...', 'info')
      const res = await publishWechat(articleData)
      if (res.code === 0) {
        addProgress('✓ 微信公众号 发布成功', 'success')
        result.value = { success: true, message: '任务已加入队列', url: '' }
      } else {
        addProgress(`✗ 微信公众号 发布失败: ${res.message}`, 'danger')
        result.value = { success: false, message: res.message }
      }
    } else {
      // 多平台走 publish:batch (任务队列)
      addProgress(`批量发布到 ${selectedPlatforms.value.length} 个平台...`, 'info')
      const res = await publishBatch(selectedPlatforms.value, articleData)
      if (res.code === 0) {
        addProgress(`✓ 已添加 ${res.data?.taskIds?.length || ''} 个任务到队列`, 'success')
        result.value = { success: true, message: res.message || '任务已加入队列', url: '' }
      } else {
        addProgress(`✗ 批量发布失败: ${res.message}`, 'danger')
        result.value = { success: false, message: res.message }
      }
    }
  } catch (e) {
    addProgress(`✗ 错误: ${e.message}`, 'danger')
    result.value = { success: false, message: e.message }
  } finally {
    publishing.value = false
  }
}
</script>

<style scoped>
.publish-page {
  max-width: 1200px;
}
</style>