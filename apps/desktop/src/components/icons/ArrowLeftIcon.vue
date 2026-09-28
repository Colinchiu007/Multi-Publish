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
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
</template>
