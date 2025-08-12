<script setup lang="ts">
import { defineProps } from "vue";
import type { WizardState } from '@/components/wizard';

const props = defineProps<WizardState>();

const {currentComponent, index} = props;
</script>

<template>
  <Transition mode="out-in">
    <KeepAlive>
      <component :is="currentComponent" :key="currentComponent.name" />
    </KeepAlive>
  </Transition>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
