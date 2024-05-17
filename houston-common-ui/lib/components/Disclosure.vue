<script setup lang="ts">
import { defineModel, onMounted, ref, computed, onUnmounted } from "vue";
import { ChevronUpIcon } from '@heroicons/vue/20/solid';

const wrapperElement = ref<InstanceType<typeof HTMLDivElement> | null>(null);
const internalWrapperElement = ref<InstanceType<typeof HTMLDivElement> | null>(null);

const show = defineModel<boolean>("show", { default: false });

const internalHeight = ref(0);

const elementHeight = computed<number>(() => {
    const height = show.value ? internalHeight.value : 0;
    return height;
});

const observer = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
        internalHeight.value = entry.contentRect.height;
    });
});

onMounted(() => {
    if (internalWrapperElement.value !== null) {
        internalHeight.value = internalWrapperElement.value.scrollHeight;
        observer.observe(internalWrapperElement.value);
    } else {
        console.error(new Error("Failed to set up ResizeObserver for internalWrapperElement: ref was null in onMounted()"));
    }
});

onUnmounted(() => {
    observer.disconnect();
})

</script>

<template>
    <div class="flex flex-col w-full items-start">
        <button
            @click="show = !show"
            class="inline-flex justify-between space-x-2 w-full sm:w-auto cursor-pointer"
        >
            <label class="text-label grow-0 cursor-pointer">
                <slot name="label">Click to expand</slot>
            </label>
            <ChevronUpIcon
                :class="show ? '-rotate-180 transform ease-out' : 'ease-in'"
                class="size-icon icon-default grow-0 transition-transform duration-200 ease-in-out"
            />
        </button>
        <div
            ref="wrapperElement"
            :style="{ 'max-height': `${elementHeight}px` }"
            class="transition-[max-height] duration-200 overflow-hidden w-full"
            :class="show ? 'ease-out' : 'ease-in'"
        >
            <div ref="internalWrapperElement">
                <slot />
            </div>
        </div>
    </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
