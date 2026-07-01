<template>
  <div>
    <div class="cohere-page-header">
      <div>
        <div class="page-title">关键词监测</div>
        <div class="page-subtitle">持续监测关键词讨论热度变化，异常飙升时自动通知</div>
      </div>
    </div>
    <div class="cohere-content">
      <KeywordMonitorPanel />
    </div>
  </div>
</template>

<script setup>
import KeywordMonitorPanel from '@/components/KeywordMonitorPanel.vue'
</script>
