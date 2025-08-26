<script setup lang="ts">
import { computed, defineProps, type Component } from "vue";
import { type HoustonAppTabEntry } from "@/components/tabs";

const props = defineProps<{
  currentComponent?: Component;
  noKeepAlive?: boolean;
}>();
</script>

<template>
  <KeepAlive :max="noKeepAlive ? 0 : undefined">
    <component v-if="currentComponent" :is="currentComponent" :key="currentComponent.name" />
  </KeepAlive>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
