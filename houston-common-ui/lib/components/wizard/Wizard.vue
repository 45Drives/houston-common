<script setup lang="ts">
import { createWizardInjectionKey, defineWizardSteps, type WizardStep } from "./index";
import WizardStepView from "./WizardStepView.vue";
import StepsHeader from "./StepsHeader.vue";
import { computed, defineProps, ref, watch } from "vue";
import { ProgressBar } from "@/components";

const props = defineProps<{
  id: string;
  steps: WizardStep[];
  onComplete: (data: any) => void;
  hideHeader?: boolean;
}>();

const emit = defineEmits(["goBack", "onComplete"]);

console.log(props.id);

const state = defineWizardSteps(props.steps, createWizardInjectionKey(props.id));
console.log("defined");

watch(
  () => state.completedSteps, // Watch only completedSteps
  (newCompletedSteps) => {
    console.log(newCompletedSteps);

    if (
      newCompletedSteps.value.filter((completed) => completed === true).length ===
      props.steps.length
    ) {
      props.onComplete(state.data);
    }
  },
  { deep: true } // Ensure it tracks changes inside the array
);

const progress = computed(() => {
  const total = props.steps.length;
  const current = state.index.value;
  return Math.round((current / total) * 100);
});
</script>

<template>
  <div class="flex flex-col">
    <StepsHeader v-if="!hideHeader" v-bind="state" />
    <ProgressBar class="w-full" v-if="hideHeader" :percent="progress" />
    <WizardStepView v-bind="state" class="grow" @goBack="emit('goBack')" />
  </div>
</template>
