<script setup lang="ts">
import { defineProps } from "vue";
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
</script>

<template>
    <div
        class="text-default flex flex-col h-full"
        :class="{ 'cursor-wait': globalProcessingState }"
    >
        <HoustonHeader :moduleName="moduleName">
            <template
                v-slot:header-left
                v-if="tabState"
            >
                <TabSelector
                    v-if="tabState"
                    :state="tabState"
                />
            </template>
        </HoustonHeader>
        <Teleport to="body">
            <NotificationView class="overflow-hidden grow basis-0 flex items-stretch">

            </NotificationView>
        </Teleport>
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
</template>

<style scoped>
@import "houston-common-css/src/index.css";
</style>
