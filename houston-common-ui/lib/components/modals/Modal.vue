<script setup lang="ts">
import { useGlobalProcessingState } from '@/composables/useGlobalProcessingState';
import { defineProps, defineModel, defineEmits, withDefaults, computed } from "vue";

const props = withDefaults(
  defineProps<{
    show: boolean;
    /**
     * forces modal container to have w-full class instead of max-w-full
     */
    forceFullWidth?: boolean;
    appearFrom?:
      | "center"
      | "top"
      | "bottom"
      | "left"
      | "right"
      | `${"top" | "bottom"}-${"left" | "right"}`;
  }>(),
  { appearFrom: "center" }
);

const classPositioning = (direction: "from" | "to") => {
  if (props.appearFrom === "center") {
    return `translate-y-4 sm:translate-y-0 ${direction == "from" ? "sm:scale-90" : "sm:scale-75"}`;
  }
  let classes = ["scale-0"];
  if (props.appearFrom.includes("top")) {
    classes.push("-translate-y-1/2");
  } else if (props.appearFrom.includes("bottom")) {
    classes.push("translate-y-1/2");
  }
  if (props.appearFrom.includes("left")) {
    classes.push("-translate-x-1/2");
  } else if (props.appearFrom.includes("right")) {
    classes.push("translate-x-1/2");
  }
  return classes.join(" ");
};

const emit = defineEmits<{
  (e: "clickOutside"): void;
  (e: "beforeEnter"): void;
  (e: "enter"): void;
  (e: "afterEnter"): void;
  (e: "enterCancelled"): void;
  (e: "beforeLeave"): void;
  (e: "leave"): void;
  (e: "afterLeave"): void;
  (e: "leaveCancelled"): void;
}>();


const globalProcessingState = useGlobalProcessingState();

</script>

<template>
  <Teleport to="body">
    <div class="fixed z-10 text-default" :class="{ '!cursor-wait': globalProcessingState !== 0 }">
      <Transition
        mode="out-in"
        enter-active-class="ease-out duration-500"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="ease-in duration-500"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="show"
          class="fixed z-10 inset-0 bg-neutral-500/75 dark:bg-black/50 transition-opacity pointer"
        />
      </Transition>
      <Transition
        mode="out-in"
        enter-active-class="ease-out duration-300"
        :enter-from-class="classPositioning('from') + ' opacity-0'"
        enter-to-class="opacity-100 translate-y-0 sm:scale-100"
        leave-active-class="ease-in duration-100"
        leave-from-class="opacity-100 translate-y-0 sm:scale-100"
        :leave-to-class="classPositioning('to') + ' opacity-0'"
        @beforeEnter="emit('beforeEnter')"
        @enter="emit('enter')"
        @afterEnter="emit('afterEnter')"
        @enterCancelled="emit('enterCancelled')"
        @beforeLeave="emit('beforeLeave')"
        @leave="emit('leave')"
        @afterLeave="emit('afterLeave')"
        @leaveCancelled="emit('leaveCancelled')"
      >
        <!-- ask Josh before changing anything below -->
        <div
          v-if="show"
          class="fixed overflow-auto z-10 inset-0 flex items-end sm:items-center justify-center px-4 pb-20 pt-4 sm:pb-4"
          @click.self="emit('clickOutside')"
        >
          <div
            :class="[
              forceFullWidth ? 'w-full' : 'max-w-full',
              'max-h-full overflow-show whitespace-normal',
            ]"
          >
            <slot />
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
