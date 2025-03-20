<script setup lang="ts">
import { defineWizardSteps, type WizardStep } from "./index";
import WizardStepView from "./WizardStepView.vue";
import StepsHeader from "@/components/wizard/StepsHeader.vue";
import { computed, defineProps } from "vue";

const props = defineProps<{
  steps: WizardStep[];
  hideHeader?: boolean;
}>();

const state = defineWizardSteps(props.steps);

</script>

<template>
  <div class="flex flex-col">
    <StepsHeader v-if="!hideHeader" v-bind="state" />
    <WizardStepView v-bind="state" class="grow" />
  </div>
</template>
