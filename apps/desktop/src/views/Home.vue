<template>
  <div>
    <!-- 页面头部 -->
    <div class="cohere-page-header">
      <div>
        <div class="page-title">关于</div>
        <div class="page-subtitle">社媒管家 — 多平台内容一键发布</div>
      </div>
    </div>

    <div class="cohere-content">
      <!-- Hero 区域 -->
      <div class="cohere-dark-band" style="margin-bottom:var(--space-xl)">
        <h2>📢 社媒管家</h2>
        <p>多平台内容一键发布工具 · 基于 Playwright RPA 自动化</p>
      </div>

      <!-- 特性卡片 -->
      <div class="cohere-card-grid">
        <div class="cohere-card" style="cursor:default">
          <div class="card-top">
            <div class="card-icon">🤖</div>
            <div class="card-info">
              <div class="card-platform">RPA 自动化</div>
              <div class="card-account">Playwright 驱动浏览器，模拟人工操作发布</div>
            </div>
          </div>
        </div>
        <div class="cohere-card" style="cursor:default">
          <div class="card-top">
            <div class="card-icon">🔐</div>
            <div class="card-info">
              <div class="card-platform">Cookie 持久化</div>
              <div class="card-account">加密保存登录态，无需重复扫码</div>
            </div>
          </div>
        </div>
        <div class="cohere-card" style="cursor:default">
          <div class="card-top">
            <div class="card-icon">🚀</div>
            <div class="card-info">
              <div class="card-platform">一键多平台</div>
              <div class="card-account">同时发布到微信、知乎、微博、抖音等平台</div>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top:var(--space-xl);font-size:13px;color:var(--muted);text-align:center">
        v{{ version }} · PROJECT-003 Multi-Publish
      </div>
    </div>
  </div>
</template>

<script setup>
const version = '1.0.0'
</script>