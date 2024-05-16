<script setup lang="ts">
import { defineProps, defineModel, defineEmits, ref } from "vue";
import InputFeedback from "./InputFeedback.vue";
import ToolTip from '@/components/ToolTip.vue';

const props = defineProps<{
  placeholder?: string;
  validator?: (value: string) => { type: "error" | "warning", message: string; } | undefined;
}>();

const model = defineModel<string>({ default: "" });

const emit = defineEmits<{
  (e: 'input', value: string): void,
  (e: 'change', value: string): void,
}>();

const feedback = ref<{ type: "error" | "warning", message: string; } | undefined>(undefined);

const showToolTip = ref(false);

</script>

<template>
  <div>
    <div
      v-if="$slots.default || $slots.tooltip"
      class="flex items-start"
    >
      <label
        v-if="$slots.default"
        class="text-label"
        :class="{ 'underline decoration-dotted': $slots.tooltip }"
        @mouseenter="showToolTip = true"
        @mouseleave="showToolTip = false"
        @click="showToolTip = !showToolTip"
      >
        <slot />
      </label>
      <ToolTip
        v-if="$slots.tooltip"
        v-model="showToolTip"
        :class="{ 'pl-1': $slots.default }"
      >
        <slot name="tooltip" />
      </ToolTip>
    </div>
    <input
      type="text"
      name="label"
      class="w-full input-textlike"
      :placeholder="placeholder"
      v-model="model"
      @input="emit('input', model)"
      @change="{ emit('change', model); feedback = validator?.(model); }"
    />
    <InputFeedback
      v-if="feedback"
      :type="feedback.type"
      :message="feedback.message"
    />
  </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
