<script setup lang="ts">
import { Switch, SwitchDescription, SwitchGroup, SwitchLabel } from '@headlessui/vue';
import { defineModel, ref } from "vue";
import ToolTip from '@/components/ToolTip.vue';

const props = defineProps<{
  /**
   * Place switch label to the right
   */
  labelRight?: boolean;
  disabled?: boolean;
}>();

const model = defineModel<boolean>({ default: false });

const showToolTip = ref(false);

</script>

<template>
  <SwitchGroup
    as="div"
    :class="[labelRight ? 'flex-row-reverse' : 'flex-row', 'inline-flex items-center justify-between space-x-4']"
  >
    <span
      v-if="$slots.default || $slots.description || $slots.tooltip"
      class="inline-flex flex-col"
    >
      <div class="inline-flex grow-0">
        <SwitchLabel
          as="label"
          class="text-label"
          :class="{ 'underline decoration-dotted': $slots.tooltip }"
          @mouseenter="showToolTip = true"
          @mouseleave="showToolTip = false"
          @click="showToolTip = !showToolTip"
          passive
        >
          <slot />
        </SwitchLabel>
        <ToolTip
          v-if="$slots.tooltip"
          v-model="showToolTip"
          :class="{ 'pl-1': $slots.default }"
        >
          <slot name="tooltip" />
        </ToolTip>
      </div>
      <SwitchDescription
        as="div"
        class="text-sm text-muted cursor-default"
      >
        <slot name="description" />
      </SwitchDescription>
    </span>
    <Switch
      v-model="model"
      :disabled="disabled"
      :class="[model ? 'bg-45d' : 'bg-well', 'inline-flex shrink-0 h-6 w-11 p-[2px] rounded-full cursor-pointer shadow-inner transition-colors ease-in-out duration-200']"
    >
      <span
        aria-hidden="true"
        :class="[model ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-default shadow-md transform transition-transform ease-in-out duration-200']"
      />
    </Switch>
  </SwitchGroup>
</template>

<style>
@import "@45drives/houston-common-css/src/index.css";
</style>
