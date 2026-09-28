<script setup>
// 图标几何取自 Lucide（https://lucide.dev，ISC License），24×24 网格 / 2px 圆头描边。
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
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
</template>
