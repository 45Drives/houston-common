<script setup lang="ts">
import { createWizardInjectionKey, defineWizardSteps, type WizardStep } from "./index";
import WizardStepView from "./WizardStepView.vue";
import StepsHeader from "./StepsHeader.vue";
import { computed, watch } from "vue";
import { ProgressBar } from "@/components";

const props = defineProps<{
  id: string;
  steps: WizardStep[];
  onComplete: (data: any) => void;
  hideHeader?: boolean;
  hideProgress?: boolean;
  progressOverride?: number | null;
}>();

const emit = defineEmits(["goBack", "onComplete"]);

// console.log(props.id);

const state = defineWizardSteps(props.steps, createWizardInjectionKey(props.id));
// console.log("defined");

watch(
  () => state.completedSteps, // Watch only completedSteps
  (newCompletedSteps) => {
    // console.log(newCompletedSteps);

    if (
      newCompletedSteps.value.filter((completed) => completed === true).length ===
      props.steps.length
    ) {
      props.onComplete(state.data);
    }
  },
  { deep: true } // Ensure it tracks changes inside the array
);

const computedProgress = computed(() => {
  const total = props.steps.length;
  const current = state.index.value; // 0..total-1
  if (total <= 1) return 100;
  return Math.round((current / (total - 1)) * 100);
});


const progress = computed(() => {
  const p = props.progressOverride;
  if (typeof p === "number" && Number.isFinite(p)) {
    return Math.min(100, Math.max(0, Math.round(p)));
  }
  return computedProgress.value;
});
</script>

<template>
  <div class="flex flex-col">
    <StepsHeader v-if="!hideHeader" v-bind="state" />
    <ProgressBar v-if="hideHeader && !hideProgress" class="w-full" :percent="progress" />
    <WizardStepView v-bind="state" class="grow" @goBack="emit('goBack')" />
  </div>
</template>
