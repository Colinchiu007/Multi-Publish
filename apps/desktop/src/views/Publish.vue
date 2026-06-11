<template>
  <div>
    <!-- 页面头部 -->
    <div class="cohere-page-header">
      <div>
        <div class="page-title">一键发布</div>
        <div class="page-subtitle">编辑内容并发布到多个平台</div>
      </div>
    </div>

    <div class="cohere-content" style="display:flex;gap:var(--space-xl)">
      <!-- 左侧：文章编辑 -->
      <div style="flex:2;min-width:0">
        <div class="cohere-card" style="cursor:default">
          <div class="cohere-form">
            <div class="cohere-form-item">
              <label class="cohere-form-label">标题</label>
              <input
                class="cohere-input"
                v-model="article.title"
                placeholder="请输入文章标题"
                maxlength="64"
              />
            </div>
            <div class="cohere-form-item">
              <label class="cohere-form-label">作者</label>
              <input
                class="cohere-input"
                v-model="article.author"
                placeholder="作者名称（选填）"
                maxlength="20"
                style="max-width:300px"
              />
            </div>
            <div class="cohere-form-item">
              <label class="cohere-form-label">正文</label>
              <ArticleEditor v-model="article.content" />
            </div>
            <!-- 视频上传 -->
            <div class="cohere-form-item" v-if="selectedPlatforms.some(p => ['douyin', 'tencent_video', 'kuaishou'].includes(p))">
              <label class="cohere-form-label">视频文件</label>
              <el-upload
                drag
                :auto-upload="false"
                :limit="1"
                accept="video/*"
                :on-change="(file) => { article.video_path = (file.raw && (file.raw.path || file.raw.name)) || file.name || '' }"
              >
                <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                <div class="el-upload__text">拖拽视频文件到这里，或 <em>点击选择</em></div>
                <template #tip>
                  <div class="el-upload__tip">支持 mp4/mov/avi，最大 500MB</div>
                </template>
              </el-upload>
            </div>
            <div class="cohere-form-item">
              <label class="cohere-form-label">封面图 URL</label>
              <input
                class="cohere-input"
                v-model="article.cover_url"
                placeholder="封面图片链接（选填）"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：发布目标 + 操作 -->
      <div style="flex:1;min-width:280px">
        <div class="cohere-card" style="cursor:default">
          <div class="cohere-form" style="gap:var(--space-md)">
            <div class="cohere-form-label">发布目标</div>
            <el-checkbox-group v-model="selectedPlatforms">
              <div v-for="p in platforms" :key="p.id" style="margin-bottom:10px">
                <el-checkbox :label="p.id" :disabled="p.disabled">
                  <span style="margin-left:6px">{{ p.label }}</span>
                  <span v-if="p.tag" class="cohere-tag" :class="p.tagClass" style="margin-left:8px">{{ p.tag }}</span>
                </el-checkbox>
              </div>
            </el-checkbox-group>

            <div class="cohere-divider"></div>

            <button
              class="cohere-btn-primary"
              style="width:100%;justify-content:center"
              :disabled="selectedPlatforms.length === 0 || publishing"
              @click="handlePublish"
            >
              {{ publishing ? '发布中...' : '🚀 一键发布' }}
            </button>
          </div>
        </div>

        <!-- 进度 -->
        <div v-if="progress.length > 0" class="cohere-card" style="margin-top:16px;cursor:default">
          <ul class="cohere-timeline">
            <li
              v-for="(item, idx) in progress"
              :key="idx"
              class="cohere-timeline-item"
              :class="item.type"
            >
              <span class="tl-time">{{ item.time }}</span>
              <span class="tl-text">{{ item.text }}</span>
            </li>
          </ul>
        </div>

        <!-- 发布结果 -->
        <div v-if="result" class="cohere-card" style="margin-top:16px;cursor:default">
          <div :style="{ display:'flex', gap:'8px', alignItems:'center' }">
            <span v-if="result.success" class="cohere-tag cohere-tag-success">✓ 发布成功</span>
            <span v-else class="cohere-tag cohere-tag-danger">✗ 发布失败</span>
            <span style="font-size:13px;color:var(--muted)">{{ result.message }}</span>
          </div>
          <div v-if="result.url" style="margin-top:12px">
            <a :href="result.url" target="_blank" style="font-size:13px;color:var(--action-blue);text-decoration:none">
              查看文章 →
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { publishWechat, publishBatch, onProgress } from '@/api/publisher'
import ArticleEditor from '@/components/ArticleEditor.vue'

const platforms = [
  { id: 'wechat_mp', label: '微信公众号', icon: '💬', tag: null, tagClass: '' },
  { id: 'zhihu', label: '知乎', icon: '❓', tag: null, tagClass: '' },
  { id: 'weibo', label: '微博', icon: '✧', tag: '新增', tagClass: 'cohere-tag-success' },
  { id: 'douyin', label: '抖音', icon: '🎵', tag: '新增', tagClass: 'cohere-tag-success' },
  { id: 'xiaohongshu', label: '小红书', icon: '📕', tag: '新增', tagClass: 'cohere-tag-warning' },
  { id: 'tencent_video', label: '视频号', icon: '▶', tag: '新', tagClass: 'cohere-tag-info' },
  { id: 'kuaishou', label: '快手', icon: '🎬', tag: '新', tagClass: 'cohere-tag-success' },
  { id: 'toutiao', label: '今日头条', icon: '📰', tag: '新', tagClass: 'cohere-tag-success' },
  { id: 'youtube', label: 'YouTube', icon: '▶️', tag: '新', tagClass: 'cohere-tag-success' },
  { id: 'tiktok', label: 'TikTok', icon: '🎶', tag: '新', tagClass: 'cohere-tag-success' },
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

  if (cancelListen.value) cancelListen.value()
  cancelListen.value = onProgress((data) => {
    addProgress(`[${data.platform}] ${data.stage}`)
  })

  try {
    const articleData = {
      title: article.title,
      content: article.content,
      author: article.author || '',
      cover_url: article.cover_url || '',
      video_path: article.video_path || ''
    }

    if (selectedPlatforms.value.length === 1 && selectedPlatforms.value[0] === 'wechat_mp') {
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