<script setup lang="ts">
import { defineProps } from "vue";
import { type HoustonAppTabEntry } from "@/components/tabs";

const props = defineProps<{
  entries: HoustonAppTabEntry[];
  index: number;
}>();
</script>

<template>
  <KeepAlive>
    <component v-if="entries.length" :is="entries[index].component" :key="[index, entries.length]" />
  </KeepAlive>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
