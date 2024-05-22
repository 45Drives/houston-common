<script lang="ts">
export type FeedbackAction = {
    label: string;
    callback: () => void | PromiseLike<void>;
};
export type Feedback = {
    type: "error" | "warning" | "none";
    message: string,
    actions?: FeedbackAction[];
};
</script>

<script setup lang="ts">
import { defineEmits } from "vue";
import { ExclamationCircleIcon, ExclamationTriangleIcon } from "@heroicons/vue/20/solid";

const props = defineProps<Omit<Feedback, 'message'>>();

const emit = defineEmits<{
    (e: "feedbackAction", action: FeedbackAction): void;
}>();

</script>

<template>
    <div
        class="feedback-group text-feedback"
        :class="type === 'error' ? 'text-error' : type === 'warning' ? 'text-warning' : 'text-primary'"
    >
        <ExclamationCircleIcon
            v-if="type === 'error'"
            class="size-icon icon-error"
        />
        <ExclamationTriangleIcon
            v-else-if="type === 'warning'"
            class="size-icon icon-warning"
        />
        <span v-if="$slots.default">
            <slot />
        </span>
        <button
            v-for="action in actions ?? []"
            :key="action.label"
            @click="async () => { await action.callback(); emit('feedbackAction', action); }"
            class="underline"
        >
            {{ action.label }}
        </button>
    </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
