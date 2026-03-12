<script setup lang="ts">
import type { WizardState } from '@/components/wizard';

const props = defineProps<WizardState>();

const {currentComponent, currentStep} = props;
</script>

<template>
  <Transition mode="out-in">
    <KeepAlive>
      <component :is="currentComponent" :key="currentComponent.name" v-bind="currentStep.props || {}"/>
    </KeepAlive>
  </Transition>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
