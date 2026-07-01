<template>
  <div>
    <div class="cohere-page-header">
      <div style="display:flex;align-items:center;gap:var(--space-md);width:100%">
        <div style="flex:1">
          <div class="page-title">云端发布</div>
          <div class="page-subtitle">提交发布任务到 ECS 服务器，不依赖本地环境</div>
        </div>
        <span class="cohere-tag" :class="orchestratorOnline ? 'cohere-tag-success' : 'cohere-tag-warning'">
          {{ orchestratorOnline ? 'orchestrator 在线' : 'orchestrator 离线' }}
        </span>
      </div>
    </div>

    <div class="cohere-content" style="display:flex;flex-direction:column;gap:var(--space-md)">
      <!-- 提交新任务 -->
      <div class="cohere-card" style="cursor:default">
        <div class="cohere-form" @submit.prevent="handleSubmit">
          <div class="cohere-form-item">
            <label class="cohere-form-label">视频 URL</label>
            <input class="cohere-input" v-model="form.videoUrl" placeholder="https://storage.example.com/videos/xxx.mp4" />
          </div>

          <div class="cohere-form-row" style="display:flex;gap:var(--space-md)">
            <div class="cohere-form-item" style="flex:1">
              <label class="cohere-form-label">目标平台</label>
              <select class="cohere-input" v-model="form.platform">
                <option v-for="p in platforms" :key="p.id" :value="p.id">{{ p.name || p.id }}</option>
              </select>
            </div>
            <div class="cohere-form-item" style="flex:2">
              <label class="cohere-form-label">标题</label>
              <input class="cohere-input" v-model="form.title" placeholder="视频标题" maxlength="80" />
            </div>
          </div>

          <div class="cohere-form-item">
            <label class="cohere-form-label">描述</label>
            <textarea class="cohere-input" v-model="form.desc" placeholder="视频描述" rows="3" style="resize:vertical;font-family:inherit;line-height:1.6"></textarea>
          </div>

          <div class="cohere-form-item">
            <label class="cohere-form-label">标签</label>
            <input class="cohere-input" v-model="tagsInput" placeholder="标签（逗号分隔）" @keydown.enter.prevent="addTag" />
            <div v-if="form.tags.length" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:var(--space-xs)">
              <span v-for="(tag, idx) in form.tags" :key="idx" class="cohere-tag cohere-tag-info" style="cursor:pointer" @click="form.tags.splice(idx, 1)">
                {{ tag }} ✕
              </span>
            </div>
          </div>

          <div class="cohere-form-item">
            <label class="cohere-form-label">封面 URL</label>
            <input class="cohere-input" v-model="form.coverUrl" placeholder="https://storage.example.com/covers/xxx.jpg（可选）" />
          </div>

          <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-md)">
            <button class="cohere-btn cohere-btn-primary" @click="handleSubmit" :disabled="submitting">
              {{ submitting ? '提交中...' : '提交云端发布' }}
            </button>
          </div>

          <div v-if="submitResult" class="cohere-form-item" style="margin-top:var(--space-sm)">
            <div v-if="submitResult.ok" class="cohere-tag cohere-tag-success">任务已创建: {{ submitResult.data.task_id }}</div>
            <div v-else class="cohere-tag cohere-tag-error">提交失败: {{ submitResult.error }}</div>
          </div>
        </div>
      </div>

      <!-- 发布记录 -->
      <div class="cohere-card" style="cursor:default">
        <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-md)">
          <span class="cohere-tag cohere-tag-info">发布记录</span>
          <span style="font-size:13px;color:var(--muted)">{{ tasks.length }} 条</span>
          <div style="flex:1"></div>
          <button class="cohere-btn-ghost" @click="refreshTasks" :disabled="loadingTasks">⟳ 刷新</button>
        </div>

        <div v-if="loadingTasks" style="text-align:center;padding:20px;color:var(--muted)">加载中...</div>

        <table v-else-if="tasks.length" class="cohere-table" style="width:100%">
          <thead>
            <tr>
              <th>状态</th>
              <th>平台</th>
              <th>标题</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tasks" :key="t.id">
              <td>
                <span class="cohere-tag" :class="statusClass(t.status)">{{ statusLabel(t.status) }}</span>
              </td>
              <td>{{ t.input_data?.platform || '-' }}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.input_data?.title || '-' }}</td>
              <td style="font-size:12px;color:var(--muted)">{{ formatTime(t.created_at) }}</td>
              <td>
                <button v-if="t.status === 'failed'" class="cohere-btn-ghost" @click="retryTask(t)" style="font-size:12px">重试</button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-else style="text-align:center;padding:20px;color:var(--muted);font-size:13px">暂无发布记录</div>
      </div>
    </div>
  </div>
</template>

<script>
import { cloudPublishSubmit, cloudPublishListTasks, cloudPublishGetTask, cloudPublishPlatforms } from '../api/cloud-publisher'

export default {
  name: 'CloudPublish',
  data () {
    return {
      orchestratorOnline: true,
      platforms: [],
      form: {
        videoUrl: '',
        platform: 'bilibili',
        title: '',
        desc: '',
        tags: [],
        coverUrl: '',
      },
      tagsInput: '',
      submitting: false,
      submitResult: null,
      tasks: [],
      loadingTasks: false,
      pollTimer: null,
    }
  },
  async mounted () {
    await this.loadPlatforms()
    await this.refreshTasks()
    this.startPolling()
  },
  beforeUnmount () {
    this.stopPolling()
  },
  methods: {
    async loadPlatforms () {
      const res = await cloudPublishPlatforms()
      if (res.ok && res.data && res.data.length) {
        this.platforms = res.data
        if (!this.form.platform && this.platforms.length) {
          this.form.platform = this.platforms[0].id
        }
      }
    },

    async refreshTasks () {
      this.loadingTasks = true
      const res = await cloudPublishListTasks()
      if (res.ok && res.data) {
        this.tasks = (res.data.items || []).slice(0, 50)
        this.orchestratorOnline = true
      } else {
        this.orchestratorOnline = false
      }
      this.loadingTasks = false
    },

    startPolling () {
      this.pollTimer = setInterval(async () => {
        // Only poll if there are active (non-terminal) tasks
        const active = this.tasks.filter(t => t.status === 'pending' || t.status === 'publishing' || t.status === 'downloading')
        if (active.length > 0) {
          await this.refreshTasks()
        }
      }, 3000)
    },

    stopPolling () {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
    },

    addTag () {
      const tag = this.tagsInput.trim()
      if (tag && !this.form.tags.includes(tag)) {
        this.form.tags.push(tag)
      }
      this.tagsInput = ''
    },

    async handleSubmit () {
      if (!this.form.videoUrl || !this.form.title || !this.form.platform) {
        this.submitResult = { ok: false, error: '视频 URL、平台和标题为必填项' }
        return
      }

      this.submitting = true
      this.submitResult = null

      const res = await cloudPublishSubmit({
        videoUrl: this.form.videoUrl,
        platform: this.form.platform,
        title: this.form.title,
        desc: this.form.desc,
        tags: this.form.tags,
        coverUrl: this.form.coverUrl,
      })

      this.submitResult = res

      if (res.ok) {
        // Reset form
        this.form.videoUrl = ''
        this.form.title = ''
        this.form.desc = ''
        this.form.tags = []
        this.form.coverUrl = ''
        // Refresh task list
        await this.refreshTasks()
      }

      this.submitting = false
    },

    async retryTask (task) {
      this.form.videoUrl = task.input_data?.video_url || ''
      this.form.platform = task.input_data?.platform || 'bilibili'
      this.form.title = task.input_data?.title || ''
      this.form.desc = task.input_data?.desc || ''
      this.form.tags = task.input_data?.tags || []
      this.form.coverUrl = task.input_data?.cover_url || ''
    },

    statusClass (status) {
      const map = {
        pending: 'cohere-tag-warning',
        downloading: 'cohere-tag-info',
        publishing: 'cohere-tag-info',
        success: 'cohere-tag-success',
        failed: 'cohere-tag-error',
      }
      return map[status] || ''
    },

    statusLabel (status) {
      const map = {
        pending: '等待中',
        downloading: '下载中',
        publishing: '发布中',
        success: '已完成',
        failed: '失败',
      }
      return map[status] || status
    },

    formatTime (ts) {
      if (!ts) return '-'
      try {
        const d = new Date(ts)
        const pad = n => String(n).padStart(2, '0')
        return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
      } catch (e) {
        return ts
      }
    },
  },
}
</script>
