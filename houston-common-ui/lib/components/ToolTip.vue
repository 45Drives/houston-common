<script setup lang="ts">
import { defineModel, defineProps } from "vue";
import { QuestionMarkCircleIcon } from "@heroicons/vue/20/solid";

const show = defineModel<boolean>({ default: false });
defineProps<{
  above?: boolean;
}>();
</script>

<template>
  <span
    class="relative overflow-visible inline-block z-50"
    @click.stop="show = !show"
    @mouseenter="show = true"
    @mouseleave="show = false"
  >
    <QuestionMarkCircleIcon class="size-icon icon-default" />
    <div
      class="text-left absolute bg-default shadow-sm border border-default text-muted font-normal whitespace-pre-wrap text-sm rounded-md p-2 z-50 overflow-y-auto max-h-52"
      :class="{ 'bottom-5': above }"
      v-if="show"
    >
      <slot />
    </div>
  </span>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
