<template>
  <div class="video-clone-view">
    <h1 class="vc-title">视频克隆 · 对标拆解与再创作</h1>

    <!-- 输入区（PRD §13.2） -->
    <el-card class="vc-card" shadow="never">
      <el-radio-group v-model="sourceType" class="vc-source-type">
        <el-radio-button value="url">链接</el-radio-button>
        <el-radio-button value="local">本地文件</el-radio-button>
      </el-radio-group>

      <el-input
        v-if="sourceType === 'url'"
        v-model="linkUrl"
        placeholder="粘贴视频链接（抖音/小红书/快手/B站/视频号/YouTube/TikTok/Ins）"
        class="vc-input"
      />
      <el-input
        v-else
        v-model="filePath"
        placeholder="选择本地视频文件（mp4/mov/webm，≤500MB，≤30分钟）"
        class="vc-input"
      >
        <template #append>
          <el-button @click="pickFile">选择文件</el-button>
        </template>
      </el-input>

      <div class="vc-options">
        <el-select v-model="replicationLevel" placeholder="复刻层级" class="vc-option">
          <el-option label="L0 信息一致" value="L0" />
          <el-option label="L1 结构近似" value="L1" />
          <el-option label="L2 风格迁移" value="L2" />
        </el-select>
        <el-select v-model="mode" placeholder="复刻模式" class="vc-option">
          <el-option label="结构" value="structure" />
          <el-option label="风格" value="style" />
          <el-option label="灵感" value="inspiration" />
        </el-select>
        <el-checkbox v-model="rewriteScript">改写文案</el-checkbox>
      </div>

      <div class="vc-actions">
        <el-button type="primary" :loading="running" @click="start" :disabled="running">
          开始分析
        </el-button>
        <el-button v-if="running" @click="cancel">取消</el-button>
      </div>
    </el-card>

    <!-- 进度区（PRD §13.3） -->
    <el-card v-if="running || Object.values(stageStatus).some((s) => s !== 'idle')" class="vc-card" shadow="never">
      <template #header>分析进度</template>
      <div class="vc-stages">
        <div v-for="s in STAGE_LABELS" :key="s" class="vc-stage" :class="'is-' + stageStatus[s]">
          <span class="vc-stage-dot" />
          <span>{{ stageLabel(s) }}</span>
          <span class="vc-stage-status">{{ stageStatusText(s) }}</span>
        </div>
      </div>
    </el-card>

    <!-- 报告编辑（PRD §13.4 简化：文案 + 复刻层级） -->
    <el-card v-if="report" class="vc-card" shadow="never">
      <template #header>拆解报告（可编辑）</template>
      <el-input
        type="textarea"
        :rows="6"
        :model-value="report.script.fullText"
        placeholder="文案全文"
        @change="(v) => editReport('script.fullText', v)"
      />
      <div class="vc-meta">
        时长 {{ report.meta.durationSec }}s · 分辨率 {{ report.meta.resolution || '未知' }} · 画幅 {{ report.platformParams.aspect }}
      </div>
    </el-card>

    <!-- 结果（PRD §13.5） -->
    <el-card v-if="similarity" class="vc-card" shadow="never">
      <template #header>相似度自检（F4）</template>
      <div class="vc-sim">综合分 <b>{{ similarity.score }}</b> · 判定 <b>{{ similarity.verdict }}</b></div>
      <div class="vc-sim-metrics">
        结构 {{ similarity.metrics.structure.toFixed(2) }} · 文案 {{ similarity.metrics.script.toFixed(2) }} ·
        风格 {{ similarity.metrics.style.toFixed(2) }} · 时长偏差 {{ (similarity.metrics.durationDeviation * 100).toFixed(1) }}%
      </div>
      <el-tag v-if="similarity.warnings && similarity.warnings.verbatimScript" type="warning">
        文案近乎照抄，建议改写后再发布
      </el-tag>
    </el-card>
  </div>
</template>

<script setup>
import { useVideoClone } from '@/composables/useVideoClone'

const {
  sourceType, linkUrl, filePath, replicationLevel, mode, rewriteScript,
  running, stageStatus, report, similarity, STAGE_LABELS,
  start, cancel, editReport, pickFile,
} = useVideoClone()

function stageLabel(s) {
  return { ingest: '下载/校验', analyze: '拆解分析', plan: '方案确认', generate: '素材生成', compose: '合成', publish: '发布' }[s] || s
}
function stageStatusText(s) {
  return { idle: '等待', running: '进行中', success: '成功', failed: '失败' }[stageStatus[s]] || ''
}
</script>

<style scoped>
.video-clone-view { max-width: 860px; margin: 24px auto; padding: 0 16px; }
.vc-title { font-size: 20px; margin-bottom: 16px; }
.vc-card { margin-bottom: 16px; }
.vc-input, .vc-options { margin-top: 12px; }
.vc-option { width: 160px; margin-right: 12px; }
.vc-actions { margin-top: 16px; }
.vc-stages { display: flex; flex-wrap: wrap; gap: 12px; }
.vc-stage { display: flex; align-items: center; gap: 6px; }
.vc-stage-dot { width: 8px; height: 8px; border-radius: 50%; background: #c0c4cc; }
.vc-stage.is-running .vc-stage-dot { background: #409eff; animation: pulse 1s infinite; }
.vc-stage.is-success .vc-stage-dot { background: #67c23a; }
.vc-stage.is-failed .vc-stage-dot { background: #f56c6c; }
.vc-stage-status { color: #909399; font-size: 12px; }
.vc-meta { margin-top: 8px; color: #909399; font-size: 12px; }
.vc-sim { font-size: 16px; }
.vc-sim-metrics { margin: 8px 0; color: #606266; }
@keyframes pulse { 50% { opacity: 0.3; } }
</style>
