<script lang="ts">
export type SelectMenuOption<T> = {
  label: string;
  value: T;
};
</script>

<script setup lang="ts">
import { defineProps, defineModel, defineEmits, ref, computed } from "vue";
import Disclosure from "@/components/Disclosure.vue";
import { ChevronDownIcon } from "@heroicons/vue/20/solid";

const model = defineModel<unknown>();

type OptionType = typeof model.value;

const props = withDefaults(
  defineProps<{
    options: SelectMenuOption<OptionType>[];
    disabled?: boolean;
    placeholder?: string;
  }>(),
  { placeholder: "" }
);

const emit = defineEmits<{
  (e: "change", value: string): void;
}>();

const currentSelectionIndex = computed<number | undefined>(() => {
  const index = props.options.findIndex((o) => o.value === model.value);
  if (index === -1) {
    return undefined;
  }
  return index;
});

const showOptions = ref(false);
</script>

<template>
  <div
    class="inline-block w-full"
    @focusin="showOptions = true"
    @focusout="showOptions = false"
  >
    <div
      class="inline-flex flex-row justify-between gap-2 border input-textlike min-w-16 w-full sm:w-auto px-3 py-2 text-left"
      tabindex="0"
    >
      <span>
        {{
          currentSelectionIndex !== undefined
            ? options[currentSelectionIndex]!.label
            : placeholder
        }}
      </span>
      <ChevronDownIcon class="icon-default size-icon" />
    </div>
    <div class="relative">
      <Disclosure
        noButton
        :show="showOptions"
        class="absolute top-1 left-0 min-w-16 w-fit sm:w-auto overflow-y-hidden z-10"
        :transitionDuration="50"
      >
        <div
          class="w-full flex flex-col items-stretch rounded-md shadow-md bg-default border border-default max-h-40 overflow-y-auto"
        >
          <button
            v-for="(option, index) in options"
            @click="
              () => {
                model = option.value;
                showOptions = false;
              }
            "
            :class="{ 'font-bold': index === currentSelectionIndex }"
            class="px-3 text-left hover:bg-accent whitespace-nowrap"
          >
            {{ option.label }}
          </button>
        </div>
      </Disclosure>
    </div>
  </div>
  <!-- <select
      v-model="model"
      :disabled="disabled"
      class="input-textlike w-full sm:w-auto"
    >
      <option v-for="option in options" :value="option.value">
        {{ option.label }}
      </option>
    </select> -->
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
