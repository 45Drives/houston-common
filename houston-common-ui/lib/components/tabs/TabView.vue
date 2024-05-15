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
    <KeepAlive>
        <component :is="entries[currentTabIndex].component" />
    </KeepAlive>
</template>

<style scoped>
@import "houston-common-css/src/index.css";
</style>
