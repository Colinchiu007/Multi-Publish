<template>
  <div class="cohere-page">
    <div class="cohere-page-header">
      <div>
        <div class="page-title">{{ t('knowledgeBase.title') }}</div>
        <div class="page-subtitle">知识库功能建设中，后端数据层已完成</div>
      </div>
    </div>
    <div class="cohere-content">
      <p style="color:var(--muted);text-align:center;padding:60px">
        知识库后端核心已实现（store/schema/service/IPC/preload/DI/context-builder/i18n）。<br/>
        前端页面正在并行开发中，即将完成。
      </p>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

