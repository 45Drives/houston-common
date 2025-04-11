<template>
  <div class="w-full bg-well rounded-md h-6 relative overflow-hidden">
    <div
      class="h-full bg-green-500 transition-all duration-300"
      :style="{ width: percent + '%' }"
    ></div>
    <span class="absolute inset-0 flex items-center justify-center text-sm font-semibold text-default dark:text-white">
      {{ percent }}%
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  percent: number
}>()
</script>
