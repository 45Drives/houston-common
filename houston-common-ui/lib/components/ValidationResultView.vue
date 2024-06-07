<script setup lang="ts">
import { defineProps } from "vue";
import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/vue/20/solid";
import { type ValidationResult } from "@/composables/validation";

const props = defineProps<ValidationResult>();
</script>

<template>
  <div
    class="feedback-group text-feedback"
    :class="
      type === 'error'
        ? 'text-error'
        : type === 'warning'
          ? 'text-warning'
          : 'text-primary'
    "
  >
    <ExclamationCircleIcon
      v-if="type === 'error'"
      class="size-icon icon-error"
    />
    <ExclamationTriangleIcon
      v-else-if="type === 'warning'"
      class="size-icon icon-warning"
    />
    <span v-if="message">
      {{ message }}
    </span>
    <template v-if="actions !== undefined">
      <template v-for="(action, index) in actions" :key="action.label">
        <span v-if="actions.length > 1 && index === actions.length - 1"
          >or</span
        >
        <span>
          <button @click="() => action.callback()" class="underline">
            {{ action.label }}
          </button>
          {{ actions.length > 1 && index < actions.length - 1 ? "," : "" }}
        </span>
      </template>
    </template>
  </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
