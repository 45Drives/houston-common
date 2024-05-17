<script setup lang="ts">
import { defineProps, defineModel, defineEmits, ref } from "vue";
import InputFeedback from "./InputFeedback.vue";
import ToolTip from './ToolTip.vue';
import InputLabelWrapper from './InputLabelWrapper.vue';

const props = defineProps<{
  placeholder?: string;
  validator?: (value: string) => { type: "error" | "warning", message: string; } | undefined;
  disabled?: boolean;
}>();

const model = defineModel<string>({ default: "" });

const emit = defineEmits<{
  (e: 'input', value: string): void,
  (e: 'change', value: string): void,
}>();

const feedback = ref<{ type: "error" | "warning", message: string; } | undefined>(undefined);

</script>

<template>
  <InputLabelWrapper>
    <template
      v-slot:label
      v-if="$slots.default"
    >
      <slot />
    </template>
    <template
      v-slot:tooltip
      v-if="$slots.tooltip"
    >
      <slot name="tooltip" />
    </template>
    <input
      type="text"
      name="label"
      class="w-full input-textlike"
      :placeholder="placeholder"
      :disabled="disabled"
      v-model="model"
      @input="emit('input', model)"
      @change="{ emit('change', model); feedback = validator?.(model); }"
    />
    <InputFeedback
      v-if="feedback"
      :type="feedback.type"
      :message="feedback.message"
    />
  </InputLabelWrapper>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
