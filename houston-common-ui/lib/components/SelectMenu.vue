<script lang="ts">
export type SelectMenuOption<T> = {
  label: string;
  value: T;
  hoverText?: string;
};
</script>

<script setup lang="ts">
import {
  defineProps,
  defineModel,
  defineEmits,
  ref,
  computed,
  watchEffect,
  watch,
} from "vue";
import Disclosure from "@/components/Disclosure.vue";
import { ChevronDownIcon } from "@heroicons/vue/20/solid";

const model = defineModel<unknown>();

type OptionType = typeof model.value;

const props = withDefaults(
  defineProps<{
    options: SelectMenuOption<OptionType>[];
    disabled?: boolean;
    placeholder?: string;
    onKeyboardInput?: "focus" | "scroll";
  }>(),
  { placeholder: "", onKeyboardInput: "focus" }
);

const emit = defineEmits<{
  (e: "change", value: unknown): void;
}>();

const currentSelectionIndex = computed<number | undefined>(() => {
  const index = props.options.findIndex((o) => o.value === model.value);
  if (index === -1) {
    return undefined;
  }
  return index;
});

const showOptions = ref(false);

const useTempInputBuffer = (timeoutMilliseconds: number) => {
  const inputBuffer = ref<string>();

  let timeout: number | undefined = undefined;

  const onInput = (e: KeyboardEvent) => {
    if (e.key) {
      clearTimeout(timeout);
      inputBuffer.value = (inputBuffer.value ?? "") + e.key;
    }
    timeout = window.setTimeout(() => {
      inputBuffer.value = undefined;
    }, timeoutMilliseconds);
  };

  return { inputBuffer, onInput };
};

const { inputBuffer, onInput } = useTempInputBuffer(1000);

const optionRefs = ref<HTMLButtonElement[]>([]);

watch(model, () => emit('change', model.value), {deep: true, immediate: true})

watchEffect(() => {
  const searchText = inputBuffer.value?.toLowerCase();
  if (searchText === undefined) {
    return;
  }
  let focusIndex = props.options.findIndex((o) =>
    o.label.toLowerCase().startsWith(searchText)
  );
  if (focusIndex === -1) {
    focusIndex = props.options.findIndex((o) =>
      o.label.toLowerCase().includes(searchText)
    );
  }
  if (focusIndex === -1) {
    return;
  }
  if (props.onKeyboardInput === "focus") {
    optionRefs.value[focusIndex]?.focus({ preventScroll: false });
  } else {
    optionRefs.value[focusIndex]?.scrollIntoView({
      block: "nearest",
      inline: "start",
    });
  }
});
</script>

<template>
  <div
    class="inline-block w-full"
    @focusin="showOptions = true"
    @focusout="showOptions = false"
    @keypress="onInput"
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
            ref="optionRefs"
            :title="option.hoverText ?? option.label"
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
