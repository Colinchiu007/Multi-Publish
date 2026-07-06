<template>
  <div class="pipeline-browser">
    <h2 class="section-title">视频创作管线</h2>
    <p class="section-desc">选择一种视频创作模式，AI 将自动完成从脚本到成片的全流程</p>

    <div v-if="loading" class="loading-state">
      <span class="spinner"></span>
      <span>加载管线列表...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <span>⚠️</span>
      <span>{{ error }}</span>
    </div>

    <div v-else class="pipeline-grid">
      <div
        v-for="p in pipelines"
        :key="p.name"
        class="pipeline-card"
        :class="[p.stability || 'experimental']"
        @click="$emit('select', p)"
      >
        <div class="card-header">
          <span class="badge" :class="p.category">{{ p.category }}</span>
          <span class="stability-dot" :class="p.stability || 'experimental'" :title="'稳定性: ' + (p.stability || 'experimental')"></span>
        </div>
        <h3 class="card-title">{{ humanName(p.name) }}</h3>
        <p class="card-desc">{{ p.description ? p.description.substring(0, 120) + (p.description.length > 120 ? "..." : "") : "暂无描述" }}</p>
        <div class="card-footer">
          <span class="version">v{{ p.version || "?" }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "PipelineBrowser",
  emits: ["select"],
  data() {
    return {
      pipelines: [],
      loading: true,
      error: null,
    };
  },
  async mounted() {
    try {
      // Use Electron IPC if available, otherwise show demo data
      if (window.electronAPI?.pipelines?.list) {
        const result = await window.electronAPI.pipelines.list();
        if (result.success) {
          this.pipelines = result.data;
        } else {
          this.error = result.error;
        }
      } else {
        // Fallback for vitest/dev
        this.pipelines = [];
      }
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    humanName(name) {
      if (!name) return "";
      return name
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    },
  },
};
</script>

<style scoped>
.pipeline-browser { padding: 16px; }
.section-title { font-size: 1.4rem; margin-bottom: 4px; }
.section-desc { color: #666; margin-bottom: 20px; font-size: 0.9rem; }
.pipeline-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.pipeline-card {
  background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px;
  cursor: pointer; transition: all 0.2s;
}
.pipeline-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); transform: translateY(-2px); }
.pipeline-card.experimental { border-left: 3px solid #f59e0b; }
.pipeline-card.beta { border-left: 3px solid #3b82f6; }
.pipeline-card.production { border-left: 3px solid #22c55e; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.badge {
  font-size: 0.7rem; padding: 2px 8px; border-radius: 4px;
  text-transform: uppercase; font-weight: 600;
}
.badge.generated { background: #dbeafe; color: #1d4ed8; }
.badge.assembly { background: #fef3c7; color: #b45309; }
.badge.hybrid { background: #d1fae5; color: #047857; }
.card-title { font-size: 1.05rem; margin: 0 0 6px 0; }
.card-desc { font-size: 0.82rem; color: #666; line-height: 1.4; margin: 0 0 12px 0; }
.card-footer { display: flex; justify-content: flex-end; }
.version { font-size: 0.75rem; color: #999; }
.stability-dot {
  width: 8px; height: 8px; border-radius: 50%; display: inline-block;
}
.stability-dot.experimental { background: #f59e0b; }
.stability-dot.beta { background: #3b82f6; }
.stability-dot.production { background: #22c55e; }
.loading-state, .error-state { display: flex; align-items: center; gap: 8px; padding: 24px; color: #666; }
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.6s linear infinite; }
.error-state { color: #ef4444; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
