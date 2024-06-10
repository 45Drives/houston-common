<script setup lang="ts">
import { ref, defineProps } from "vue";
import ToolTip from "@/components/ToolTip.vue";

const showToolTip = ref(false);

defineProps<{
  tooltipAbove?: boolean;
}>();
</script>

<template>
  <div>
    <div v-if="$slots.label || $slots.tooltip" class="flex items-start">
      <label
        v-if="$slots.label"
        class="text-label"
        :class="{ 'underline decoration-dotted': $slots.tooltip }"
        @mouseenter="showToolTip = true"
        @mouseleave="showToolTip = false"
        @click="showToolTip = !showToolTip"
      >
        <slot name="label" />
      </label>
      <ToolTip
        :above="tooltipAbove"
        v-if="$slots.tooltip"
        v-model="showToolTip"
        :class="{ 'pl-1': $slots.label }"
      >
        <slot name="tooltip" />
      </ToolTip>
    </div>
    <slot />
  </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
