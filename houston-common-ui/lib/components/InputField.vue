<script setup lang="ts">
import {
  defineProps,
  defineModel,
  defineEmits,
  computed,
  defineExpose,
  ref,
  watchEffect,
  onMounted,
} from "vue";
import InputFeedback from "@/components/InputFeedback.vue";
import { v4 as uuidv4 } from "uuid";
import { type Feedback } from "@/components/InputFeedback.vue";

export type InputValidator = (
  value: string
) => Feedback | undefined | PromiseLike<Feedback | undefined>;

const [model, modifiers] = defineModel<string>({ default: "" });

const props = withDefaults(
  defineProps<{
    type?: HTMLInputElement["type"];
    placeholder?: string;
    validator?: InputValidator;
    disabled?: boolean;
    suggestions?: string[];
  }>(),
  {
    type: "text",
  }
);

const emit = defineEmits<{
  (e: "input", value: string): void;
  (e: "change", value: string): void;
}>();

const onInput = ({ target }: Event) => {
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (modifiers.lazy) {
    return;
  }
  model.value = target.value;
  emit("input", model.value);
};

const onChange = ({ target }: Event) => {
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  model.value = target.value;
  emit("change", model.value);
};

const feedback = ref<Feedback>();
const updateFeedback = async () =>
  (feedback.value = await props.validator?.(model.value));
watchEffect(updateFeedback);

const suggestionListId = ref<string>();
onMounted(() => (suggestionListId.value = uuidv4()));

const valid = computed<boolean>(() => !(feedback.value?.type === "error"));

defineExpose({
  valid,
});
</script>

<template>
  <input
    :type="type"
    name="label"
    class="w-full input-textlike"
    :placeholder="placeholder"
    :disabled="disabled"
    :value="model"
    @input="onInput"
    @change="onChange"
    :list="suggestionListId"
    autocomplete="off"
  />
  <datalist v-if="suggestions" :id="suggestionListId">
    <option v-for="suggestion in suggestions" :value="suggestion"></option>
  </datalist>
  <InputFeedback
    v-if="feedback"
    :type="feedback.type"
    :actions="feedback.actions"
    @feedbackAction="updateFeedback"
  >
    {{ feedback.message }}
  </InputFeedback>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
