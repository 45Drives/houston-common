export { default as HoustonHeader } from "@/components/HoustonHeader.vue";
export { default as LoadingSpinner } from "@/components/LoadingSpinner.vue";
export { default as NotificationView } from "@/components/NotificationView.vue";
export * from "@/components/NotificationView.vue";
export { default as Logo45Drives } from "@/components/Logo45Drives.vue";
export * from "@/components/HoustonAppContainer.vue";
export { default as HoustonAppContainer } from "@/components/HoustonAppContainer.vue";
export { default as CardContainer } from "@/components/CardContainer.vue";
export { default as CenteredCardColumn } from "@/components/CenteredCardColumn.vue";
export { default as ParsedTextArea } from "@/components/ParsedTextArea.vue";
export * from "@/components/InputFeedback.vue";
export { default as InputFeedback } from "@/components/InputFeedback.vue";
export * from "@/components/InputField.vue";
export { default as InputField } from "@/components/InputField.vue";
export { default as ToggleSwitch } from "@/components/ToggleSwitch.vue";
export { default as ToggleSwitchGroup } from "@/components/ToggleSwitchGroup.vue";
export { default as ToolTip } from "@/components/ToolTip.vue";
export { default as Disclosure } from "@/components/Disclosure.vue";
export { default as SelectMenu } from "@/components/SelectMenu.vue";
export * from "@/components/SelectMenu.vue";
export { default as InputLabelWrapper } from "@/components/InputLabelWrapper.vue";

export * from "@/components/tabs";

export * from "@/components/modals";

export * from "@/composables/useDynamicFormGeneration";

export * from "@/composables/useDynamicFormGenerationPromise";

export * from "@/composables/useDarkModeState";
export * from "@/composables/useGlobalProcessingState";
export * from "@/composables/useTempObjectStaging";
export * from "@/composables/wrapActions";

import { reportError } from '@/components/NotificationView.vue';

window.onerror = (event) => {
    if (typeof event === "string") {
        reportError(new Error(event));
    } else {
        const errorEvent = event as ErrorEvent;
        reportError(new Error(`${errorEvent.filename}:${errorEvent.lineno}:${errorEvent.colno}: ${errorEvent.message}`));
    }
    return false;
}
