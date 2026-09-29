<script setup>
// 图标几何取自 Lucide（https://lucide.dev，ISC License）的 loader-circle：开口圆环。
// 本组件只负责形状；旋转由消费方 CSS 决定，且必须只在「真在加载」时挂载。
defineProps({ size: { type: [Number, String], default: 16 } })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
</template>
