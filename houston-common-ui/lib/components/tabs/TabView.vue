<script setup lang="ts">
import { defineProps } from 'vue';
import { type HoustonAppTabState } from "@/components/tabs";

const props = defineProps<{
    state: HoustonAppTabState,
}>();

const currentTabIndex = props.state.index;
const entries = props.state.entries;
</script>

<template>
    <component :is="entries[currentTabIndex].component" />
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
