<script lang="ts">
import { type Feedback } from '@/components/InputFeedback.vue';
export type InputValidator = (value: string) => Feedback | undefined | PromiseLike<Feedback | undefined>;
</script>

<script setup lang="ts">
import { defineProps, defineModel, defineEmits, computed, defineExpose, ref, watchEffect } from "vue";
import { ExclamationCircleIcon, ExclamationTriangleIcon } from "@heroicons/vue/20/solid";
import InputLabelWrapper from './InputLabelWrapper.vue';
import InputFeedback from '@/components/InputFeedback.vue';

const props = defineProps<{
  placeholder?: string;
  validator?: InputValidator;
  disabled?: boolean;
}>();

const model = defineModel<string>({ default: "" });

const emit = defineEmits<{
  (e: 'input', value: string): void,
  (e: 'change', value: string): void,
}>();

const feedback = ref<Feedback>();
const updateFeedback = async () =>
  feedback.value = await props.validator?.(model.value);
watchEffect(updateFeedback);

const valid = computed<boolean>(() => !(feedback.value?.type === "error"));

defineExpose({
  valid,
});

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
      @change="emit('change', model)"
    />
    <InputFeedback
      v-if="feedback"
      :type="feedback.type"
      :actions="feedback.actions"
      @feedbackAction="updateFeedback"
    >
      {{ feedback.message }}
    </InputFeedback>
  </InputLabelWrapper>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
