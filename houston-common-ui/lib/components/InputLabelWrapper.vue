<script setup lang="ts">
import { ref } from "vue";
import { ToolTip } from "@45drives/houston-common-ui";

const showToolTip = ref(false);

</script>

<template>
    <div>
        <div
            v-if="$slots.label || $slots.tooltip"
            class="flex items-start"
        >
            <label
                v-if="$slots.label"
                class="text-label"
                :class="{ 'underline decoration-dotted': $slots.tooltip }"
                @mouseenter="showToolTip = true"
                @mouseleave="showToolTip = false"
                @click="showToolTip = !showToolTip"
            >
                <slot name="label" />
            </label>
            <ToolTip
                v-if="$slots.tooltip"
                v-model="showToolTip"
                :class="{ 'pl-1': $slots.label }"
            >
                <slot name="tooltip" />
            </ToolTip>
        </div>
        <slot />
    </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
