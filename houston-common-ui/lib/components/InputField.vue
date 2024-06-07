<script setup lang="ts">
import {
  defineProps,
  defineModel,
  defineEmits,
} from "vue";
import { v4 as uuidv4 } from "uuid";

const [model, modifiers] = defineModel<string>({ default: "" });

const props = withDefaults(
  defineProps<{
    type?: HTMLInputElement["type"];
    placeholder?: string;
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

const suggestionListId = uuidv4();
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
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
