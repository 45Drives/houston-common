<script setup lang="ts">
import { computed, defineProps, type Component } from "vue";
import { type HoustonAppTabEntry } from "@/components/tabs";
import type { WizardState } from '@/components/wizard';

const props = defineProps<WizardState>();

const {currentComponent, index} = props;
</script>

<template>
  <KeepAlive>
    <component :is="currentComponent" :key="currentComponent.name" />
  </KeepAlive>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
