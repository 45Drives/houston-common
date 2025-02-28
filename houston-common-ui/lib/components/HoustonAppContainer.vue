<script setup lang="ts">
import { defineProps, computed } from "vue";
import HoustonHeader from "@/components/HoustonHeader.vue";
import {
  defineHoustonAppTabState,
  type HoustonAppTabEntry,
  TabSelector,
  TabView,
} from "@/components/tabs";
import NotificationView from "@/components/NotificationView.vue";
import { useGlobalProcessingState } from "@/composables/useGlobalProcessingState";
import { Modal, GlobalModalConfirm } from "@/components/modals";
import { _internal } from "@/composables/globalModalConfirm";
import { QuestionMarkCircleIcon } from "@heroicons/vue/20/solid";
import DisclosureController from "@/components/DisclosureController.vue";
import CardContainer from "@/components/CardContainer.vue";

const props = defineProps<{
  moduleName: string;
  /**
   * set as `:appVersion="__APP_VERSION__"`
   */
  appVersion: string;
  sourceURL?: string;
  issuesURL?: string;
  tabs?: HoustonAppTabEntry[];
  noScroll?: boolean;
  notificationComponent?: any;
}>();

const {
  currentComponent,
  labels: tabLabels,
  index: tabIndex,
} = defineHoustonAppTabState(computed(() => props.tabs ?? []));

const globalProcessingState = useGlobalProcessingState();
</script>

<template>
  <div
    class="text-default flex flex-col h-full"
    :class="{ '!cursor-wait': globalProcessingState !== 0 }"
  >
    <HoustonHeader :moduleName="moduleName">
      <template v-slot:header-left v-if="tabs">
        <TabSelector :labels="tabLabels" v-model:index="tabIndex" />
      </template>

      <template v-slot:header-right v-if="props.notificationComponent">
      <component :is="props.notificationComponent" />
    </template>
    </HoustonHeader>
    <div 
    :class="['grow basis-0 flex flex-col items-stretch', (noScroll? '' : 'overflow-y-auto')]"
    >
      <div :class="['bg-well grow', (noScroll? '' : 'overflow-y-auto')]" style="scrollbar-gutter: stable both-edges">
        <slot>
          <TabView v-if="tabs" :currentComponent="currentComponent" />
        </slot>
      </div>
      <div class="grow-0 overflow-visible relative">
        <div
          class="absolute bottom-0 right-0 h-auto inline-flex flex-row justify-end gap-2 py-2 px-6"
        >
          <slot name="bottomRightButtonIcons"></slot>
          <!-- plugin info popup -->
          <DisclosureController v-slot="{ show, setShow }">
            <button @click="setShow(true)">
              <QuestionMarkCircleIcon class="size-icon icon-default" />
            </button>
            <Modal @clickOutside="setShow(false)" :show="show">
              <CardContainer>
                <template #header>
                  {{ `${moduleName} ${appVersion}` }}
                </template>
                <div class="flex flex-col">
                  <span>
                    Created by
                    <a
                      class="text-link"
                      href="https://www.45drives.com/?utm_source=Houston&utm_medium=UI&utm_campaign=OS-Link"
                      target="_blank"
                    >
                      45Drives
                    </a>
                    for Houston UI (Cockpit)
                  </span>
                  <a v-if="sourceURL" class="text-link" :href="sourceURL" target="_blank"
                    >Source Code</a
                  >
                  <a v-if="issuesURL" class="text-link" :href="issuesURL" target="_blank"
                    >Issue Tracker</a
                  >
                </div>

                <template #footer>
                  <div class="button-group-row justify-end">
                    <button @click="setShow(false)" class="btn btn-primary">Close</button>
                  </div>
                </template>
              </CardContainer>
            </Modal>
          </DisclosureController>
        </div>
      </div>
    </div>
    <NotificationView />
    <GlobalModalConfirm />
  </div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
