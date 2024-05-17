<script lang="ts">
export type SelectMenuOption<T> = {
    label: string;
    value: T;
};
</script>

<script setup lang="ts">
import { defineProps, defineModel, defineEmits, ref } from "vue";
import InputLabelWrapper from "./InputLabelWrapper.vue";

const model = defineModel<unknown>();

type OptionType = typeof model.value;

const props = defineProps<{
    options: SelectMenuOption<OptionType>[];
    disabled?: boolean;
}>();

const emit = defineEmits<{
    (e: 'change', value: string): void,
}>();

const showToolTip = ref(false);

</script>

<template>
    <InputLabelWrapper>
        <template
            v-slot:label
            v-if="$slots.default"
        >
            <slot />
        </template>
        <template
            v-slot:tooltip
            v-if="$slots.tooltip"
        >
            <slot name="tooltip" />
        </template>
        <select
            v-model="model"
            :disabled="disabled"
            class="input-textlike w-full sm:w-auto"
        >
            <option
                v-for="option in options"
                :value="option.value"
            >
                {{ option.label }}
            </option>
        </select>
    </InputLabelWrapper>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
