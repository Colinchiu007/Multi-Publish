<template>
  <div class="library-page">
    <div class="page-header">
      <h1>项目库</h1>
      <p class="text-muted">所有视频生产项目档案</p>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <div class="skeleton-grid">
        <div v-for="i in 6" :key="i" class="skeleton-card">
          <div class="skeleton-thumb"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <p class="error-msg">{{ error }}</p>
      <UiButton @click="refresh">重试</UiButton>
    </div>

    <!-- 空状态 -->
    <div v-else-if="projects.length === 0" class="empty-state">
      <div class="empty-icon">🎬</div>
      <p>暂无项目，开始第一次视频生产吧</p>
      <UiButton @click="$router.push('/create')">浏览流水线</UiButton>
    </div>

    <!-- 项目列表 -->
    <div v-else class="project-grid">
      <ProjectCard
        v-for="p in projects"
        :key="p.id"
        :project="p"
        @delete="handleDelete"
      />
    </div>

    <!-- 删除确认弹窗 -->
    <div v-if="deleteTarget" class="confirm-overlay" @click.self="deleteTarget = null">
      <div class="confirm-dialog">
        <p>确定要删除项目"{{ deleteTargetName }}"吗？此操作不可撤销。</p>
        <div class="confirm-actions">
          <UiButton variant="ghost" @click="deleteTarget = null">取消</UiButton>
          <UiButton variant="danger" @click="confirmDelete">删除</UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProjectList } from '@/composables/useBacklot'
import ProjectCard from '@/components/ProjectCard.vue'
import UiButton from '@/components/UiButton.vue'

const { projects, loading, error, refresh, deleteProject } = useProjectList()

const deleteTarget = ref(null)
const deleteTargetName = computed(() => {
  if (!deleteTarget.value) return ''
  const p = projects.value.find(x => x.id === deleteTarget.value)
  return p ? p.name : ''
})

function handleDelete(projectId) {
  deleteTarget.value = projectId
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  await deleteProject(deleteTarget.value)
  deleteTarget.value = null
}

onMounted(() => {
  refresh()
})
</script>

<style>
.library-page {
  padding: 24px;
}
.page-header {
  margin-bottom: 24px;
}
.page-header h1 {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 4px 0;
}
.text-muted {
  color: var(--text-muted, #909399);
  font-size: 14px;
  margin: 0;
}

/* 加载骨架屏 */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.skeleton-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #e4e7ed);
  border-radius: 12px;
  overflow: hidden;
  padding: 0 0 12px 0;
}
.skeleton-thumb {
  width: 100%;
  height: 140px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
.skeleton-line {
  height: 14px;
  margin: 12px 14px 8px;
  background: #f0f0f0;
  border-radius: 4px;
}
.skeleton-line.short {
  width: 60%;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 错误状态 */
.error-state {
  text-align: center;
  padding: 48px 24px;
}
.error-msg {
  color: var(--coral, #f56c6c);
  margin-bottom: 16px;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 64px 24px;
}
.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.4;
}
.empty-state p {
  color: var(--text-muted, #909399);
  margin-bottom: 16px;
  font-size: 15px;
}

/* 项目网格 */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

/* 删除确认弹窗 */
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.confirm-dialog {
  background: var(--bg-card, #fff);
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
}
.confirm-dialog p {
  margin: 0 0 20px 0;
  font-size: 15px;
  line-height: 1.6;
}
.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
</style>
