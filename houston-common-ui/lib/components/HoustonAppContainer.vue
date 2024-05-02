<script setup lang="ts">
import { defineProps, type Component, type PropType } from "vue";
import HoustonHeader from "@/components/HoustonHeader.vue";
import { defineHoustonAppTabState, type HoustonAppTabEntrySpec, TabSelector, TabView } from '@/components/tabs';
import NotificationView from "@/components/NotificationView.vue";

const props = defineProps<{
    moduleName: string,
    tabs?: HoustonAppTabEntrySpec[];
}>();

const tabState = props.tabs !== undefined ? defineHoustonAppTabState(props.tabs) : null;
</script>

<template>
    <div class="flex flex-col text-default h-full">
        <HoustonHeader :moduleName="moduleName">
            <template v-slot:header-left v-if="tabState">
                <TabSelector :state="tabState" />
            </template>
        </HoustonHeader>
        <div class="overflow-hidden grow basis-0 flex items-stretch">
            <div
                class="bg-well overflow-y-auto grow"
                style="scrollbar-gutter: stable both-edges;"
            >
            <slot>
                <TabView v-if="tabState" :state="tabState" />
            </slot>
            </div>
        </div>
        <NotificationView />
    </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
