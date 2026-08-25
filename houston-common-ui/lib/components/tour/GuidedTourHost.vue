<template>
  <GuidedTour :steps="activeTour?.steps ?? []" :active="!!activeTour" @done="finishTour" @skip="finishTour" />
</template>

<script setup lang="ts">
import GuidedTour from "./GuidedTour.vue";
import { useGuidedTour } from "@/composables/useGuidedTour";

const { activeTour, finishTour } = useGuidedTour();
</script>
