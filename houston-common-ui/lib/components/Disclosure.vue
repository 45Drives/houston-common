<script setup lang="ts">
import {
  defineModel,
  onMounted,
  ref,
  computed,
  onUnmounted,
  defineProps,
  watchEffect,
} from "vue";
import { ChevronUpIcon } from "@heroicons/vue/20/solid";

const props = withDefaults(
  defineProps<{
    /**
     * Don't show dropdown text with chevron (hidden disclosure)
     */
    noButton?: boolean;
    transitionDuration?: number;
  }>(),
  {
    transitionDuration: 200,
  }
);

const show = defineModel<boolean>("show", { default: false });

const wrapperElement = ref<InstanceType<typeof HTMLDivElement> | null>(null);
const internalWrapperElement = ref<InstanceType<typeof HTMLDivElement> | null>(
  null
);

const internalHeight = ref(0);

const elementHeight = computed<number>(() => {
  const height = show.value ? internalHeight.value : 0;
  return height;
});

const observer = new ResizeObserver((entries) => {
  entries.forEach((entry) => {
    console.log("updating internal height:", entry.contentRect.height);
    internalHeight.value = entry.contentRect.height;
  });
});

const visible = ref(false);
const visibleTimeout = ref<number>();

watchEffect(() => {
  window.clearTimeout(visibleTimeout.value);
  if (show.value) {
    // revealing contained element
    visible.value = true;
  } else {
    // hiding contained element
    visibleTimeout.value = window.setTimeout(() => {
      visible.value = false;
      visibleTimeout.value = undefined;
    }, props.transitionDuration);
  }
});

onMounted(() => {
  if (internalWrapperElement.value !== null) {
    internalHeight.value = internalWrapperElement.value.scrollHeight;
    observer.observe(internalWrapperElement.value);
  } else {
    console.error(
      new Error(
        "Failed to set up ResizeObserver for internalWrapperElement: ref was null in onMounted()"
      )
    );
  }
});

onUnmounted(() => {
  observer.disconnect();
});
</script>

<template>
  <div class="flex flex-col w-full items-start">
    <button
      v-if="!noButton"
      @click="show = !show"
      class="inline-flex justify-between space-x-2 w-full sm:w-auto cursor-pointer"
    >
      <label class="text-label grow-0 cursor-pointer">
        <slot name="label">Click to expand</slot>
      </label>
      <ChevronUpIcon
        class="size-icon icon-default grow-0 transition-transform ease-in-out"
        :class="[
          show ? '-rotate-180 transform ease-out' : 'ease-in',
          `duration-[${transitionDuration}ms]`,
        ]"
      />
    </button>
    <div
      ref="wrapperElement"
      :style="{
        'max-height': `${elementHeight}px`,
        'transition-duration': `${transitionDuration}ms`,
      }"
      :class="[
        show ? 'ease-out' : 'ease-in',
        `transition-[max-height] overflow-y-hidden w-full`,
      ]"
    >
      <div ref="internalWrapperElement">
        <slot :visible="visible" />
      </div>
    </div>
  </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
