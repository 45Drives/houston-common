<script lang="ts">
import { provide, inject, type InjectionKey, ref, type Ref } from "vue";
import { ModalConfirm, type ConfirmOptions } from '@/components/modals';
import { okAsync, errAsync, ResultAsync } from 'neverthrow';
import { type Action } from "@/composables/wrapActions";

export type GlobalModalConfirmFunctions = {
    confirm: (options: ConfirmOptions) => ResultAsync<boolean, Error>;
    confirmBeforeAction: (
        options: ConfirmOptions,
        action: Action<any, any, any>
    ) => typeof action;
};

const globalModalConfirmFuncs = ref<GlobalModalConfirmFunctions>();

const getGlobalModalConfirmFuncs = () => {
    if (globalModalConfirmFuncs.value === undefined) {
        throw new Error("Global ModalConfirm methods not provided!");
    }
    return globalModalConfirmFuncs.value;
};

export const confirm = (...args: Parameters<GlobalModalConfirmFunctions["confirm"]>): ReturnType<GlobalModalConfirmFunctions["confirm"]> =>
    getGlobalModalConfirmFuncs().confirm(...args);
export const confirmBeforeAction = (...args: Parameters<GlobalModalConfirmFunctions["confirmBeforeAction"]>): ReturnType<GlobalModalConfirmFunctions["confirmBeforeAction"]> =>
    getGlobalModalConfirmFuncs().confirmBeforeAction(...args);

</script>

<script setup lang="ts">
import { defineComponent, defineProps, onMounted, watchEffect, type Component, type PropType } from "vue";
import HoustonHeader from "@/components/HoustonHeader.vue";
import { defineHoustonAppTabState, type HoustonAppTabEntrySpec, TabSelector, TabView } from '@/components/tabs';
import NotificationView from "@/components/NotificationView.vue";
import { useGlobalProcessingState } from '@/composables/useGlobalProcessingState';

const props = defineProps<{
    moduleName: string,
    tabs?: HoustonAppTabEntrySpec[];
}>();

const tabState = (props.tabs !== undefined) ? defineHoustonAppTabState(props.tabs) : null;

const globalProcessingState = useGlobalProcessingState();

const globalModalConfirm = ref<InstanceType<typeof ModalConfirm> | null>(null);

watchEffect(() => {
    if (globalModalConfirm.value !== null) {
        globalModalConfirmFuncs.value = globalModalConfirm.value;
    }
});

</script>

<template>
    <div
        class="text-default flex flex-col h-full"
        :class="{ '!cursor-wait': globalProcessingState }"
    >
        <HoustonHeader :moduleName="moduleName">
            <template
                v-slot:header-left
                v-if="tabState"
            >
                <TabSelector :state="tabState" />
            </template>
        </HoustonHeader>
        <div class="overflow-hidden grow basis-0 flex items-stretch">
            <div
                class="bg-well overflow-y-auto grow"
                style="scrollbar-gutter: stable both-edges;"
            >
                <slot>
                    <TabView
                        v-if="tabState"
                        :state="tabState"
                    />
                </slot>
            </div>
        </div>
        <NotificationView />
        <ModalConfirm ref="globalModalConfirm" />
    </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
